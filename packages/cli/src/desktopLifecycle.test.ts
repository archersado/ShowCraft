import { afterAll, afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn as cpSpawn, type ChildProcess } from "node:child_process";

import { DesktopRunnerError } from "@showcraft/core";

import { createStartUpOSDesktopRunner } from "./desktopLifecycle.js";

/**
 * Story 3.1 desktop lifecycle adapter tests. Every case runs the adapter
 * against an injected `sh <launcher.sh> <fake-app.js> <mode>` command inside
 * a throwaway StartUpOS-shaped directory — no real StartUpOS checkout, no
 * GUI, no credentials. Leftover-process assertions use the same primitive the
 * adapter relies on: `process.kill(-pgid, 0)` throwing ESRCH.
 *
 * The adapter's readiness gate needs an "Electron main process alive in the
 * group". Real Electron is out of scope for unit tests, so the fixture ships
 * a `fake-ps` script that reports the fake app as
 * `…/Electron.app/Contents/MacOS/Electron` (and never for a `--type=` helper),
 * standing in for `ps -eo pid=,pgid=,command=`. The gate logic against a real
 * Electron tree is verified manually against the actual StartUpOS instance
 * (see the plan's Verification section); here the gate must simply hold when
 * the main process is absent — every failure case below proves that.
 *
 * The launcher echoes its own pgid (`launcher-pgid=<n>`) before exec'ing the
 * fake app — the adapter spawns detached, so the launcher pid IS the process
 * group the adapter will signal, and tests can observe it directly.
 *
 * Fake-app modes (single file, behavior picked by argv[2] after exec):
 *  - "serve": HTTP server answering 2xx on an ephemeral port, prints
 *    `fake-listen <port>`, exits on SIGTERM. Optional "spawn-child": fork a
 *    long-lived grandchild so group signals must cover descendants.
 *  - "exit-fast": stderr note, exit code 7 (build-failure shape).
 *  - "ignore-term": HTTP server, SIGTERM ignored (forces SIGKILL upgrade).
 *  - "hang": alive, never ready, never exits (readiness-timeout shape).
 *  - "exit-zero": exit 0 immediately (single-instance-lock pseudo-ready
 *    shape — paired with a stand-in HTTP server keeping 2xx alive).
 */

/** Temp fixture roots created during this run — removed after each test. */
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// Safety net for crashed tests: kill every tracked group so a failed
// assertion never leaks processes into the rest of the suite.
const trackedGroups: number[] = [];

afterAll(() => {
  for (const pgid of trackedGroups.splice(0)) {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // already gone
    }
  }
});

function assertGroupEmpty(pgid: number): void {
  expect(() => process.kill(-pgid, 0)).toThrowError(
    expect.objectContaining({ code: "ESRCH" }),
  );
}

function assertGroupAlive(pgid: number): void {
  process.kill(-pgid, 0); // throws ESRCH when empty — must not here
}

type Fixture = {
  root: string;
  /** Spawn command: `sh launcher.sh <app.js> <mode…>`; adapter runs this. */
  command(mode: string, ...extra: string[]): string[];
  /**
   * Spawn an independent session of the fake tree (detached, own group) and
   * resolve with its pgid — a shadow of what the adapter creates, used to
   * observe group behavior directly.
   */
  launchShadow(mode: string, ...extra: string[]): Promise<ChildProcess>;
};

const LAUNCHER_NAME = "launcher.sh";
const FAKE_APP_NAME = "fake-app.js";
const FAKE_PS_NAME = "fake-ps";

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-"));
  tempRoots.push(root);
  // StartUpOS-shaped root: package.json with a desktop:dev script.
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fake-startupos", scripts: { "desktop:dev": "echo fake" } }),
    "utf8",
  );
  const appPath = join(root, FAKE_APP_NAME);
  await writeFile(
    appPath,
    `
const http = require("node:http");
const mode = process.argv[2];

function serve(ignoreTerm) {
  // Port can be pinned via --port N so a probe launch and the adapter's own
  // session can be pointed at the same URL; "auto" picks an ephemeral one.
  const portIndex = process.argv.indexOf("--port");
  const requested = portIndex !== -1 ? Number(process.argv[portIndex + 1]) : 0;
  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.end("fake-desktop-ready");
  });
  server.listen(requested, "127.0.0.1", () => {
    const port = typeof server.address() === "object" ? server.address().port : requested;
    process.stdout.write("fake-listen " + port + "\\n");
  });
  if (ignoreTerm) {
    process.on("SIGTERM", () => process.stdout.write("fake-ignored-term\\n"));
  } else {
    process.on("SIGTERM", () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 300).unref();
    });
  }
}

if (mode === "serve") {
  if (process.argv.includes("spawn-child")) {
    const { spawn } = require("node:child_process");
    // Long-lived grandchild in the same process group — group signals must
    // reap it even though it is not our direct child.
    const grandchild = spawn(process.execPath, [__filename, "hang"], {
      stdio: "ignore",
    });
    grandchild.unref();
  }
  serve(false);
} else if (mode === "ignore-term") {
  serve(true);
} else if (mode === "exit-fast") {
  process.stderr.write("fake-build-failure\\n");
  process.exit(7);
} else if (mode === "hang") {
  setInterval(() => {}, 10_000);
} else if (mode === "exit-zero") {
  process.exit(0);
} else {
  process.exit(3);
}
`,
    "utf8",
  );
  const launcherPath = join(root, LAUNCHER_NAME);
  await writeFile(
    launcherPath,
    `#!/bin/sh
echo "launcher-pgid=$$"
exec "${process.execPath}" "$@"
`,
    { encoding: "utf8", mode: 0o755 },
  );
  // Stand-in for `ps -eo pid=,pgid=,command=` that reports the fixture's own
  // processes as an Electron main process (unless --type= appears). The real
  // ps is used underneath; fixture lines get a fake binary path prepended.
  // The adapter invokes `fake-ps -eo pid=,pgid=,command=` — $2 carries the
  // format string when the script is exec'd directly via its shebang.
  const fakePsPath = join(root, FAKE_PS_NAME);
  await writeFile(
    fakePsPath,
    `#!/bin/sh
if [ "$1" = "-eo" ] && [ "$2" = "pid=,pgid=,command=" ]; then
  /bin/ps -eo pid=,pgid=,command= -ww | awk -v root="${root}" -v fakebin="${root}/Electron.app/Contents/MacOS/Electron" '
    $0 ~ root && $0 !~ /--type=/ && $0 !~ /awk/ {
      pid = $1; pgid = $2;
      sub(/^[^ ]+ +[^ ]+ +/, "");
      print pid " " pgid " " fakebin " " $0;
      next;
    }
    { print }'
else
  /bin/ps "$@"
fi
`,
    { encoding: "utf8", mode: 0o755 },
  );

  return {
    root,
    command: (mode, ...extra) => ["/bin/sh", launcherPath, appPath, mode, ...extra],
    launchShadow: (mode, ...extra) =>
      Promise.resolve(
        cpSpawn("/bin/sh", [launcherPath, appPath, mode, ...extra], {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      ),
  };
}

const FAST = {
  pollIntervalMs: 25,
  stopGraceMs: 400,
  stopKillWaitMs: 400,
};

/**
 * Runner under test with fast timings and the fake-ps binary so the
 * "Electron main in group" gate can fire against the fixture app.
 */
function makeRunner(fixture: Fixture, overrides: Record<string, unknown> = {}) {
  return createStartUpOSDesktopRunner({
    startupOsRoot: fixture.root,
    spawnCommand: fixture.command("serve"),
    psCommand: join(fixture.root, FAKE_PS_NAME),
    rendererUrl: "http://127.0.0.1:1", // dead port by default → readiness fails
    readinessTimeoutMs: 2000,
    ...FAST,
    ...overrides,
  } as Parameters<typeof createStartUpOSDesktopRunner>[0]);
}

/** Extract `key=value` from diagnostics text. */
function diagField(diagnostics: string, key: string): string | null {
  return new RegExp(`^${key}=(.*)$`, "m").exec(diagnostics)?.[1] ?? null;
}

/** Discover the fake app's ephemeral port from its `fake-listen N` output. */
async function waitFakeListen(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fake app never listened")), 5000);
    child.stdout?.on("data", (chunk: Buffer): void => {
      const match = /fake-listen (\d+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });
}

/** Kill a shadow tree by group and track it for post-crash cleanup. */
function killShadowGroup(pgid: number): void {
  trackedGroups.push(pgid);
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    // already gone
  }
}
void killShadowGroup;

/** Find the fixture-rooted fake-app process pids via the real ps. */
function findFixtureAppPids(root: string, mode: string): number[] {
  const stdout = execFileSync("/bin/ps", ["-eo", "pid=,command="], { encoding: "utf8" });
  return stdout
    .split("\n")
    .filter((line) => line.includes(root) && line.includes(FAKE_APP_NAME) && line.includes(mode))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

describe("StartUpOS desktop lifecycle adapter (story 3.1)", () => {
  it("matrix 1: normal start → ready → stop, zero leftover processes", async () => {
    const fixture = await makeFixture();
    // The fake app supports --port pinning: probe on one port, kill the probe,
    // then point the adapter at the same URL for its own session.
    const probe = await fixture.launchShadow("serve");
    const port = await waitFakeListen(probe);
    if (probe.pid) {
      killGroup(probe.pid);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));

    const runner = makeRunner(fixture, {
      spawnCommand: fixture.command("serve", "--port", String(port)),
      rendererUrl: `http://127.0.0.1:${port}`,
      readinessTimeoutMs: 5000,
    });
    const info = await runner.start();
    expect(info.rendererUrl).toBe(`http://127.0.0.1:${port}`);
    expect(runner.state).toBe("ready");

    await expect(runner.stop()).resolves.toBeUndefined();
    expect(runner.state).toBe("stopped");
    await expect(runner.stop()).resolves.toBeUndefined(); // idempotent
  }, 20_000);

  it("matrix 2: missing executable rejects in spawn phase (ENOENT surfaced)", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, {
      spawnCommand: [join(fixture.root, "no-such-binary")],
      readinessTimeoutMs: 1000,
    });
    const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
    expect(error).toBeInstanceOf(DesktopRunnerError);
    expect(error.phase).toBe("spawn");
    expect(error.diagnostics).toContain("spawn_enoent");
    expect(error.diagnostics).toContain("ENOENT");
  }, 15_000);

  it("matrix 3: non-zero exit before readiness → reclaim, exit info + output tail in diagnostics", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, {
      spawnCommand: fixture.command("exit-fast"),
      readinessTimeoutMs: 5000,
    });
    const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
    expect(error).toBeInstanceOf(DesktopRunnerError);
    expect(error.phase).toBe("readiness");
    expect(diagField(error.diagnostics, "reason")).toBe("exited_before_ready");
    expect(diagField(error.diagnostics, "exit_code")).toBe("7");
    expect(diagField(error.diagnostics, "elapsed_ms")).toMatch(/^\d+$/);
    expect(diagField(error.diagnostics, "renderer_url")).toMatch(/^http:/);
    expect(error.diagnostics).toContain("fake-build-failure"); // stderr tail
    expect(runner.state).toBe("stopped");
  }, 15_000);

  it("matrix 4: readiness timeout reclaims the whole group including grandchildren", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, {
      spawnCommand: fixture.command("serve", "spawn-child"),
      readinessTimeoutMs: 800,
    });
    const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
    expect(error).toBeInstanceOf(DesktopRunnerError);
    expect(error.phase).toBe("readiness");
    expect(diagField(error.diagnostics, "reason")).toBe("readiness_timeout");
    expect(diagField(error.diagnostics, "renderer_url")).toMatch(/^http:/);
    // Group snapshot (进程快照) is part of the timeout diagnostics.
    expect(error.diagnostics).toContain("group_alive=");
    expect(error.diagnostics).toContain("group_pids=");
    const leftover = findFixtureAppPids(fixture.root, "hang");
    expect(leftover).toEqual([]); // grandchild reaped with the group
  }, 15_000);

  it("matrix 5: app crashing (SIGKILL) mid-readiness fails fast with exit signal", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, {
      spawnCommand: fixture.command("hang"),
      readinessTimeoutMs: 30_000,
    });
    const started = runner.start().catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const victims = findFixtureAppPids(fixture.root, "hang");
    expect(victims.length).toBeGreaterThan(0);
    process.kill(victims[0]!, "SIGKILL");
    const error = (await started) as DesktopRunnerError;
    expect(error).toBeInstanceOf(DesktopRunnerError);
    expect(error.phase).toBe("readiness");
    expect(diagField(error.diagnostics, "reason")).toBe("exited_before_ready");
    expect(diagField(error.diagnostics, "exit_signal")).toBe("SIGKILL");
    expect(runner.state).toBe("stopped");
  }, 15_000);

  it("matrix 6: second start on one runner instance is refused as already_started", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, { readinessTimeoutMs: 30_000 });
    const first = runner.start().catch((e: unknown) => e);
    // start() is in flight; an immediate second call must be refused.
    const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
    expect(error).toBeInstanceOf(DesktopRunnerError);
    expect(error.phase).toBe("precondition");
    expect(diagField(error.diagnostics, "reason")).toBe("already_started");
    // Crash the in-flight app so the first start resolves (exited before ready).
    await new Promise((resolve) => setTimeout(resolve, 200));
    const victims = findFixtureAppPids(fixture.root, "serve");
    if (victims.length > 0) {
      process.kill(victims[0]!, "SIGKILL");
    }
    expect((await first as DesktopRunnerError).phase).toBe("readiness");
  }, 15_000);

  it("matrix 7: single-instance-lock shape (exit 0 + HTTP alive) fails readiness without pseudo-success", async () => {
    const fixture = await makeFixture();
    // Stand-in server keeps HTTP 2xx alive while the fake app exits 0 —
    // exactly the Next-dev-continues / Electron-quits shape.
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.end("stand-in");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const runner = makeRunner(fixture, {
        spawnCommand: fixture.command("exit-zero"),
        rendererUrl: `http://127.0.0.1:${port}`,
        readinessTimeoutMs: 1500,
      });
      const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
      expect(error).toBeInstanceOf(DesktopRunnerError);
      expect(error.phase).toBe("readiness");
      // exit 0 must NOT resolve start(); it surfaces as exited-before-ready
      expect(diagField(error.diagnostics, "reason")).toBe("exited_before_ready");
      expect(diagField(error.diagnostics, "exit_code")).toBe("0");
      expect(runner.state).toBe("stopped");
    } finally {
      server.close();
    }
  }, 15_000);

  it("matrix 9: SIGTERM-ignoring app is SIGKILLed after grace and the group empties", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, {
      spawnCommand: fixture.command("ignore-term"),
      readinessTimeoutMs: 1500,
    });
    const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
    expect(error).toBeInstanceOf(DesktopRunnerError);
    expect(error.phase).toBe("readiness");
    expect(diagField(error.diagnostics, "reason")).toBe("readiness_timeout");
    // Failure reclaim ran SIGTERM (ignored) → SIGKILL; no leftover error.
    expect(diagField(error.diagnostics, "reason")).not.toBe("leftover_processes");
    expect(runner.state).toBe("stopped");
    const leftover = findFixtureAppPids(fixture.root, "ignore-term");
    expect(leftover).toEqual([]);
  }, 15_000);

  it("matrix 10: group signals cover grandchildren — zero residue via kill(-pgid,0)", async () => {
    const fixture = await makeFixture();
    // Shadow-launch the exact tree shape the adapter spawns (app + grandchild
    // sharing one group), reap it the way the adapter does, and assert the
    // ESRCH contract on the group id.
    const shadow = await fixture.launchShadow("serve", "spawn-child");
    const pgid = shadow.pid!;
    trackedGroups.push(pgid);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assertGroupAlive(pgid);
    process.kill(-pgid, "SIGTERM");
    await waitGroupEmpty(pgid, 2000, 25);
    assertGroupEmpty(pgid);
  }, 15_000);

  it("matrix 11: readiness failures carry readable diagnostics (phase, elapsed, rendererUrl, output tails)", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture, {
      spawnCommand: fixture.command("exit-fast"),
    });
    const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
    const lines = error.diagnostics.split("\n");
    expect(lines[0]).toBe("phase=readiness");
    expect(error.diagnostics).toContain("elapsed_ms=");
    expect(error.diagnostics).toContain("renderer_url=http://");
    expect(error.diagnostics).toContain("--- stdout tail ---");
    expect(error.diagnostics).toContain("--- stderr tail ---");
    expect(error.message.length).toBeGreaterThan(0);
  }, 15_000);

  it("matrix 12: invalid StartUpOS roots refuse in precondition without spawning", async () => {
    const cases: { name: string; build: (root: string) => Promise<void> }[] = [
      {
        name: "missing root",
        build: async (root) => void rm(root, { recursive: true, force: true }),
      },
      { name: "no package.json", build: async () => undefined },
      {
        name: "missing desktop:dev script",
        build: async (root) => {
          await writeFile(join(root, "package.json"), JSON.stringify({ scripts: {} }), "utf8");
        },
      },
      {
        name: "invalid package.json",
        build: async (root) => {
          await writeFile(join(root, "package.json"), "not json", "utf8");
        },
      },
    ];
    for (const setup of cases) {
      const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-"));
      tempRoots.push(root);
      await setup.build(root);
      const runner = createStartUpOSDesktopRunner({
        startupOsRoot: root,
        spawnCommand: ["/bin/echo", "must-never-run"],
        ...FAST,
      });
      const error = (await runner.start().catch((e: unknown) => e)) as DesktopRunnerError;
      expect(error, setup.name).toBeInstanceOf(DesktopRunnerError);
      expect(error.phase, setup.name).toBe("precondition");
      expect(error.diagnostics, setup.name).toContain("phase=precondition");
      expect(runner.state, setup.name).toBe("stopped");
    }
    // Nothing was ever spawned by the above (precondition precedes spawn).
    const psOut = execFileSync("/bin/ps", ["-eo", "command="], { encoding: "utf8" });
    expect(psOut.includes("must-never-run")).toBe(false);
  }, 20_000);

  it("matrix 8: stop is idempotent — before start, after stop, and after self-exit", async () => {
    const fixture = await makeFixture();
    const runner = makeRunner(fixture);
    // Never started: success no-op.
    await expect(runner.stop()).resolves.toBeUndefined();
    // A completed (failed) session: start already transitioned to stopped;
    // stop afterwards must remain a success no-op — twice.
    await runner.start().catch((e: unknown) => e);
    await expect(runner.stop()).resolves.toBeUndefined();
    await expect(runner.stop()).resolves.toBeUndefined();
    expect(runner.state).toBe("stopped");
  }, 15_000);
});

// ---- helpers shared by the tests above ----

function killGroup(pgid: number): void {
  trackedGroups.push(pgid);
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    // already gone
  }
}

async function waitGroupEmpty(pgid: number, budgetMs: number, intervalMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-pgid, 0);
    } catch {
      return; // ESRCH — group empty
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`process group ${pgid} did not empty within ${budgetMs}ms`);
}
