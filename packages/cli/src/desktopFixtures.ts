import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { DesktopRunnerPort } from "@showcraft/core";

type FixtureCommand = (
  file: string,
  args: readonly string[],
  options?: { timeoutMs?: number },
) => Promise<string>;

const execFileAsync = promisify(execFile);
const servers: Server[] = [];
const temporaryPaths: string[] = [];
const pendingTimers = new Set<NodeJS.Timeout>();

export async function cleanupDesktopFixtures(): Promise<void> {
  for (const timer of pendingTimers) clearTimeout(timer);
  pendingTimers.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
}

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync(
    "git",
    [
      "-c",
      "commit.gpgSign=false",
      "-c",
      "tag.gpgSign=false",
      "-c",
      `core.hooksPath=${join(root, ".fixture-hooks")}`,
      ...args,
    ],
    { cwd: root },
  );
}

/** Build a deterministic, self-contained desktop release repository for CLI tests. */
export async function buildDesktopReleaseFixture(): Promise<{
  root: string;
  changelogPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-release-"));
  temporaryPaths.push(root);
  await mkdir(join(root, ".fixture-hooks"));
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.email", "fixture@showcraft.test");
  await git(root, "config", "user.name", "ShowCraft Fixture");

  await writeFile(join(root, "README.md"), "# Desktop fixture\n", "utf8");
  await git(root, "add", "README.md");
  await git(root, "commit", "-m", "chore: seed desktop fixture");
  await git(root, "tag", "desktop-v0.1.0");

  const releaseDirectory = join(root, "docs", "changes", "releases", "v0.1.1");
  await mkdir(releaseDirectory, { recursive: true });
  const changelogPath = join(releaseDirectory, "changelog.md");
  await writeFile(
    changelogPath,
    [
      "# Desktop v0.1.1",
      "",
      "## 感知与 IM 路由",
      "",
      "- Prompt IM users for ambiguous targets.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "perception-routing.ts"),
    "export const promptAmbiguousImTarget = true;\n",
    "utf8",
  );
  await git(root, "add", "docs", "perception-routing.ts");
  await git(root, "commit", "-m", "fix(perception): prompt IM users for ambiguous targets");
  await git(root, "tag", "desktop-v0.1.1");

  return { root, changelogPath };
}

export type HttpFixtureOptions = {
  managementStatus?: number;
  managementSuccess?: boolean;
  decisions?: unknown;
  windowDelayMs?: number;
  managementDelayMs?: number;
};

function later(delayMs: number | undefined, respond: () => void): void {
  if (delayMs && delayMs > 0) {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      respond();
    }, delayMs);
    pendingTimers.add(timer);
  } else {
    respond();
  }
}

/** Start a loopback-only renderer/management fixture. */
export async function fixtureHttpServer(options: HttpFixtureOptions = {}): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/window")) {
      later(options.windowDelayMs, () => {
        if (!response.destroyed) response.writeHead(200).end("ready");
      });
      return;
    }
    if (request.url === "/api/perception/management") {
      later(options.managementDelayMs, () => {
        if (response.destroyed) return;
        response.writeHead(options.managementStatus ?? 200, {
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify({
            success: options.managementSuccess ?? true,
            data: {
              decisions: Object.hasOwn(options, "decisions")
                ? options.decisions
                : [{ candidateKeys: ["ask_user_to_choose_target", "role-agent"] }],
            },
          }),
        );
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind");
  return `http://127.0.0.1:${address.port}`;
}

/** Build an injectable runner with observable stop accounting. */
export function fakeRunner(
  origin: string,
  options: { startError?: unknown; stopError?: unknown; onStop?: () => void } = {},
): DesktopRunnerPort & { readonly processGroupId: number; readonly stops: number } {
  let stops = 0;
  return {
    processGroupId: 4242,
    get stops() {
      return stops;
    },
    async start() {
      if ("startError" in options) throw options.startError;
      return { rendererUrl: `${origin}/window?windowType=sense-center` };
    },
    async stop() {
      stops += 1;
      options.onStop?.();
      if ("stopError" in options) throw options.stopError;
    },
  };
}

export const ownedPortCommand: FixtureCommand = async (file, args) => {
  if (file === "lsof" && args.length === 2 && args[0] === "-tiTCP:3100" && args[1] === "-sTCP:LISTEN") {
    return "99\n";
  }
  if (
    file === "ps" &&
    args.length === 4 &&
    args[0] === "-o" &&
    args[1] === "pgid=" &&
    args[2] === "-p" &&
    args[3] === "99"
  ) {
    return " 4242\n";
  }
  throw new Error(`unexpected owned-port command: ${file} ${args.join(" ")}`);
};

export const validRecording = Buffer.from([0, 0, 0, 20, ...Buffer.from("ftypqt  ")]);

export async function recordingDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "showcraft-recording-"));
  temporaryPaths.push(directory);
  return directory;
}

export type RecorderMode =
  | "success"
  | "failure"
  | "missing"
  | "empty"
  | "corrupt"
  | "hang"
  | "timed-out-valid"
  | "timed-out-missing";

/** Build the eight screencapture outcomes used by desktop action tests. */
export function fakeRecorder(mode: RecorderMode): FixtureCommand {
  return async (file, args) => {
    if (file !== "/usr/sbin/screencapture") {
      throw new Error(`unexpected recorder executable: ${file}`);
    }
    if (args.length !== 6 || args.slice(0, 5).join(" ") !== "-v -V 1 -D 1") {
      throw new Error(`unexpected recorder arguments: ${args.join(" ")}`);
    }
    const output = args.at(-1);
    if (!output) throw new Error("recorder output path is missing");
    if (mode === "failure") {
      const error = new Error("Command failed: permission denied") as Error & {
        code: number;
        stderr: string;
      };
      error.code = 1;
      error.stderr = "screen capture permission denied";
      throw error;
    }
    if (mode === "missing") return "";
    if (mode === "hang") return new Promise<string>(() => undefined);
    if (mode === "empty") await writeFile(output, Buffer.alloc(0));
    if (mode === "corrupt") await writeFile(output, "not-a-movie", "utf8");
    if (mode === "success" || mode === "timed-out-valid") {
      await writeFile(output, validRecording);
    }
    if (mode === "timed-out-valid" || mode === "timed-out-missing") {
      throw new Error("recording timed out after 1000ms");
    }
    return "";
  };
}
