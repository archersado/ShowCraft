import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { get } from "node:http";
import type { DesktopRunnerPort, DesktopStartInfo } from "@showcraft/core";
import { DesktopRunnerError } from "@showcraft/core";

/**
 * StartUpOS Desktop lifecycle adapter (story 3.1). Implements the core
 * `DesktopRunnerPort` over Node primitives only: a detached spawn of
 * `pnpm desktop:dev` in its own process group, a readiness gate of
 * "renderer URL answers HTTP 2xx AND the Electron main process is alive in
 * that group" (mirroring StartUpOS's own `waitForRendererReady` semantics),
 * and a whole-group signal escalation on stop (SIGTERM → grace → SIGKILL →
 * verify empty). Every start failure reclaims the process group before
 * rejecting, so callers can rely on "error implies zero leftover processes".
 *
 * StartUpOS is treated as strictly read-only: nothing here writes into its
 * tree or reads its secrets. POSIX process groups only (macOS verified);
 * Windows has no equivalent semantics in this story.
 */

export type DesktopLifecycleOptions = {
  /** StartUpOS monorepo root — must contain package.json with a desktop:dev script. */
  startupOsRoot: string;
  /** Renderer URL to poll for readiness. Defaults to the StartUpOS dev port. */
  rendererUrl?: string;
  /** Overall readiness budget in ms. Default 180s (covers cold plugin builds + Next dev). */
  readinessTimeoutMs?: number;
  /** SIGTERM grace period in ms before SIGKILL escalation. Default 10s. */
  stopGraceMs?: number;
  /** SIGKILL settling window in ms before declaring leftovers. Default 5s. */
  stopKillWaitMs?: number;
  /** Readiness poll interval in ms. Default 500ms. */
  pollIntervalMs?: number;
  /**
   * Test seam: the full spawn command. Default `["pnpm", "desktop:dev"]` resolved
   * through the PATH (StartUpOS drives its scripts with the system pnpm).
   */
  spawnCommand?: readonly string[];
  /** Test seam: ps binary used for the group process scan. Default "ps". */
  psCommand?: string;
};

const DEFAULT_RENDERER_URL = "http://localhost:3100";
const DEFAULT_READINESS_TIMEOUT_MS = 180_000;
const DEFAULT_STOP_GRACE_MS = 10_000;
const DEFAULT_STOP_KILL_WAIT_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
/** stdout/stderr ring buffers keep the tail of app output for diagnostics. */
const OUTPUT_BUFFER_BYTES = 8 * 1024;

/** The Electron main binary — helpers live under Frameworks/ and never match. */
const ELECTRON_MAIN_PATTERN = "/Electron.app/Contents/MacOS/Electron";

type RunnerState = "idle" | "starting" | "ready" | "stopped";

/** Sliding-window byte buffer keeping the most recent `capacity` bytes. */
class RingBuffer {
  private chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly capacity: number) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.capacity && this.chunks.length > 0) {
      const overflow = this.size - this.capacity;
      const first = this.chunks[0]!;
      if (first.length <= overflow) {
        this.chunks.shift();
        this.size -= first.length;
      } else {
        this.chunks[0] = first.subarray(overflow);
        this.size -= overflow;
      }
    }
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

type Session = {
  pgid: number;
  child: ReturnType<typeof spawn>;
  stdout: RingBuffer;
  stderr: RingBuffer;
  /** Resolves when the direct child process exits (code/signal attached). */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Wall-clock ms timestamp from start() for elapsed-time diagnostics. */
  startedAt: number;
};

/** One shared group-membership probe: ESRCH means the whole group is gone. */
function isGroupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/** List the pids still living in the group (best effort, for error reports). */
function listGroupPids(pgid: number, psCommand: string): number[] {
  try {
    const stdout = execFileSync(psCommand, ["-eo", "pid=,pgid="], { encoding: "utf8" });
    const pids: number[] = [];
    for (const line of stdout.split("\n")) {
      const fields = line.trim().split(/\s+/);
      const pid = Number(fields[0]);
      const group = Number(fields[1]);
      if (Number.isInteger(pid) && Number.isInteger(group) && group === pgid) {
        pids.push(pid);
      }
    }
    return pids;
  } catch {
    return [];
  }
}

/** Snapshot of the Electron main process in the group, when one is alive. */
type ElectronProcess = { pid: number; command: string };

function findElectronMain(pgid: number, psCommand: string): ElectronProcess | null {
  try {
    const stdout = execFileSync(psCommand, ["-eo", "pid=,pgid=,command="], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") {
        continue;
      }
      const pidEnd = trimmed.indexOf(" ");
      const groupEnd = trimmed.indexOf(" ", pidEnd + 1);
      if (pidEnd === -1 || groupEnd === -1) {
        continue;
      }
      const pid = Number(trimmed.slice(0, pidEnd));
      const group = Number(trimmed.slice(pidEnd + 1, groupEnd));
      const command = trimmed.slice(groupEnd + 1);
      if (pid === 0 || !Number.isInteger(pid) || group !== pgid) {
        continue;
      }
      const binary = command.split(" ")[0] ?? "";
      // The main binary path ends with /Electron.app/Contents/MacOS/Electron;
      // helpers are ".../Frameworks/Electron Helper.app/…/Electron Helper" and
      // never match, and Chromium helper flags start with --type=.
      if (
        binary.endsWith(ELECTRON_MAIN_PATTERN) &&
        !command.includes("--type=")
      ) {
        return { pid, command };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function pollHttpOnce(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = get(url, { timeout: 2_000 }, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Truncate a multiline excerpt to its final bounded lines for diagnostics. */
function tailExcerpt(text: string, maxChars: number): string {
  const trimmed = text.trimEnd();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `…${trimmed.slice(trimmed.length - maxChars)}`;
}

export function createStartUpOSDesktopRunner(
  options: DesktopLifecycleOptions,
): DesktopRunnerPort & { readonly state: RunnerState } {
  const rendererUrl = options.rendererUrl ?? DEFAULT_RENDERER_URL;
  const readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const stopGraceMs = options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
  const stopKillWaitMs = options.stopKillWaitMs ?? DEFAULT_STOP_KILL_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const spawnCommand = options.spawnCommand ?? ["pnpm", "desktop:dev"];
  const psCommand = options.psCommand ?? "ps";

  let state: RunnerState = "idle";
  let session: Session | null = null;

  const runner = {
    get state(): RunnerState {
      return state;
    },

    async start(): Promise<DesktopStartInfo> {
      if (state === "starting" || state === "ready") {
        throw new DesktopRunnerError(
          "precondition",
          `phase=precondition\nreason=already_started\nstate=${state}`,
          "A desktop session is already active for this runner instance",
        );
      }
      if (state === "stopped") {
        throw new DesktopRunnerError(
          "precondition",
          "phase=precondition\nreason=already_stopped\nstate=stopped",
          "This runner instance has already completed a session; create a new runner to start again",
        );
      }
      state = "starting";
      const startedAt = Date.now();
      try {
        const root = await precondition();
        session = await spawnApp(root, startedAt);
        const info = await waitForReadiness(startedAt);
        state = "ready";
        return info;
      } catch (error) {
        // Every failure path reclaims the group before surfacing the error, so
        // a rejected start() always means zero leftover processes.
        const reclaimError = await teardown("stop");
        if (reclaimError) {
          throw reclaimError;
        }
        state = "stopped";
        throw error;
      }
    },

    async stop(): Promise<void> {
      // Idempotent by contract: idle (never started), stopped (already
      // stopped) and self-exited sessions are all success no-ops.
      if (state === "idle" || state === "stopped" || !session) {
        state = state === "starting" ? state : "stopped";
        return;
      }
      if (state === "starting") {
        // stop() racing an in-flight start() is not a supported handshake —
        // the port contract has start() own failure reclamation.
        throw new DesktopRunnerError(
          "stop",
          "phase=stop\nreason=stop_during_start",
          "stop() was called while start() was still in flight",
        );
      }
      const error = await teardown("stop");
      state = "stopped";
      if (error) {
        throw error;
      }
    },
  };

  function failure(
    phase: "precondition" | "spawn" | "readiness" | "stop",
    reason: string,
    message: string,
    extras: Record<string, string> = {},
  ): DesktopRunnerError {
    const lines: string[] = [
      `phase=${phase}`,
      `reason=${reason}`,
      `elapsed_ms=${session ? Date.now() - session.startedAt : 0}`,
      `renderer_url=${rendererUrl}`,
      ...Object.entries(extras).map(([key, value]) => `${key}=${value}`),
      `detail=${message}`,
    ];
    if (session) {
      lines.push("--- stdout tail ---", tailExcerpt(session.stdout.text(), 2048) || "(empty)");
      lines.push("--- stderr tail ---", tailExcerpt(session.stderr.text(), 2048) || "(empty)");
      if (phase === "readiness" || phase === "stop") {
        const pgid = session.pgid;
        const alive = isGroupAlive(pgid);
        lines.push(`group_alive=${alive}`);
        const pids = alive ? listGroupPids(pgid, psCommand) : [];
        lines.push(`group_pids=${pids.join(",") || "(none)"}`);
        const electron = alive ? findElectronMain(pgid, psCommand) : null;
        lines.push(
          electron
            ? `electron_main=present pid=${electron.pid}`
            : "electron_main=absent (single-instance lock or crash keeps HTTP alive while Electron is gone)",
        );
      }
    }
    return new DesktopRunnerError(phase, lines.join("\n"), message);
  }

  function precondition(): Promise<string> {
    const root = options.startupOsRoot;
    return (async () => {
      let packageJson: string;
      try {
        packageJson = await readFile(join(root, "package.json"), "utf8");
      } catch {
        throw failure(
          "precondition",
          "startupos_root_unreadable",
          `StartUpOS root is not a readable directory with a package.json: ${root}`,
        );
      }
      let scripts: Record<string, unknown>;
      try {
        scripts = (JSON.parse(packageJson) as { scripts?: Record<string, unknown> }).scripts ?? {};
      } catch {
        throw failure(
          "precondition",
          "startupos_package_json_invalid",
          `StartUpOS package.json is not valid JSON: ${join(root, "package.json")}`,
        );
      }
      if (typeof scripts["desktop:dev"] !== "string" || scripts["desktop:dev"] === "") {
        throw failure(
          "precondition",
          "desktop_dev_script_missing",
          `StartUpOS package.json has no "desktop:dev" script: ${join(root, "package.json")}`,
        );
      }
      return root;
    })();
  }

  function spawnApp(root: string, startedAt: number): Promise<Session> {
    return new Promise((resolveSession, rejectSession) => {
      const [command, ...args] = spawnCommand;
      if (!command) {
        rejectSession(
          failure("precondition", "spawn_command_empty", "No spawn command configured", {
            started_at: new Date(startedAt).toISOString(),
          }),
        );
        return;
      }
      let child;
      try {
        child = spawn(command, args, {
          cwd: root,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: process.env,
        });
      } catch (error) {
        rejectSession(
          failure("spawn", "spawn_failed", `Failed to spawn ${command}: ${formatError(error)}`),
        );
        return;
      }
      const stdout = new RingBuffer(OUTPUT_BUFFER_BYTES);
      const stderr = new RingBuffer(OUTPUT_BUFFER_BYTES);
      child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolveExit) => {
          child.once("exit", (code, signal) => resolveExit({ code, signal }));
          child.once("error", () => resolveExit({ code: null, signal: null }));
        },
      );

      const pgid = child.pid ?? -1;
      const describeSpawnError = (error: NodeJS.ErrnoException): string =>
        `Failed to spawn ${command} ${args.join(" ")}: ${error.code ?? "error"} ${error.message}`.trim();

      const onSpawnError = (error: NodeJS.ErrnoException): void => {
        // No process tree exists in this case; nothing to reclaim.
        rejectSession(failure("spawn", "spawn_enoent", describeSpawnError(error)));
      };

      if (pgid <= 0) {
        // ENOENT-style spawn failure surfaces through 'error'; wait for it so
        // the rejection carries the OS reason rather than a synthetic one.
        void exited.then(() => {
          rejectSession(
            failure("spawn", "spawn_failed", `Process for ${command} never started (pgid unavailable)`),
          );
        });
        child.once("error", onSpawnError);
        return;
      }

      child.once("error", onSpawnError);

      resolveSession({
        pgid,
        child,
        stdout,
        stderr,
        exited,
        startedAt,
      });
    });
  }

  async function waitForReadiness(startedAt: number): Promise<DesktopStartInfo> {
    const deadline = startedAt + readinessTimeoutMs;
    const aliveSession = session;
    if (!aliveSession) {
      throw failure("readiness", "no_session", "Readiness wait started without a session");
    }
    let httpOk = false;
    let electronSeen = false;
    while (Date.now() < deadline) {
      const exit = await Promise.race([
        aliveSession.exited.then((result) => ({ exited: true as const, result })),
        pollDelay(pollIntervalMs).then(() => ({ exited: false as const })),
      ]);
      if (exit.exited) {
        // Ready-or-not the app tree is quitting: reclaim siblings (Next dev
        // keeps running after an Electron exit) before reporting.
        const { code, signal } = exit.result;
        throw failure(
          "readiness",
          "exited_before_ready",
          `Desktop app exited before becoming ready (code=${code}, signal=${signal})`,
          {
            exit_code: String(code),
            exit_signal: String(signal ?? "none"),
          },
        );
      }
      if (!httpOk) {
        httpOk = await pollHttpOnce(rendererUrl);
      }
      if (!electronSeen) {
        electronSeen = findElectronMain(aliveSession.pgid, psCommand) !== null;
      }
      if (httpOk && electronSeen) {
        return { rendererUrl };
      }
    }
    throw failure("readiness", "readiness_timeout", `Desktop app not ready within ${readinessTimeoutMs}ms`, {
      readiness_timeout_ms: String(readinessTimeoutMs),
      http_reached_2xx: String(httpOk),
      electron_main_seen: String(electronSeen),
    });
  }

  function pollDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Whole-group teardown: SIGTERM → grace → SIGKILL → settle, then verify the
   * group is empty via `kill(-pgid, 0)` ESRCH. Returns a stop-phase error when
   * processes survive both signals; null on success. Safe to call from both
   * stop() and failed start() paths.
   */
  async function teardown(phase: "stop"): Promise<DesktopRunnerError | null> {
    const aliveSession = session;
    session = null;
    if (!aliveSession || !isGroupAlive(aliveSession.pgid)) {
      return null;
    }
    const pgid = aliveSession.pgid;
    signalGroup(pgid, "SIGTERM");
    const graceful = await waitGroupEmpty(pgid, stopGraceMs, pollIntervalMs);
    if (!graceful) {
      signalGroup(pgid, "SIGKILL");
      const killed = await waitGroupEmpty(pgid, stopKillWaitMs, pollIntervalMs);
      if (!killed) {
        return failure(
          phase,
          "leftover_processes",
          `Process group ${pgid} still has live processes after SIGKILL`,
          { leftover_pids: listGroupPids(pgid, psCommand).join(",") || "(unknown)" },
        );
      }
    }
    return null;
  }

  function signalGroup(pgid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(-pgid, signal);
    } catch {
      // Group vanished between the check and the signal — that is success.
    }
  }

  async function waitGroupEmpty(pgid: number, budgetMs: number, intervalMs: number): Promise<boolean> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      if (!isGroupAlive(pgid)) {
        return true;
      }
      await sleep(Math.min(intervalMs, Math.max(1, deadline - Date.now())));
    }
    return !isGroupAlive(pgid);
  }

  return runner;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
