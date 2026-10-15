import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopRunnerError, stableJsonBytes, type DesktopRunnerPort, type GateResult, type ReleaseBrief } from "@showcraft/core";

import { createStartUpOSDemoActions } from "./desktopActions.js";

const release: ReleaseBrief = {
  version: "v0.3.3",
  source: "fixture.md",
  features: [
    {
      id: "section-1-im",
      title: "感知与 IM 路由",
      narration: "demo",
      sourceRef: { sectionIndex: 1, sectionTitle: "感知与 IM 路由", startLine: 5, endLine: 11 },
    },
    {
      id: "section-2-section",
      title: "企业微信办公能力",
      narration: "demo",
      sourceRef: { sectionIndex: 2, sectionTitle: "企业微信办公能力", startLine: 12, endLine: 17 },
    },
    {
      id: "section-3-agent",
      title: "Agent 与任务协作",
      narration: "demo",
      sourceRef: { sectionIndex: 3, sectionTitle: "Agent 与任务协作", startLine: 18, endLine: 23 },
    },
  ],
};

const gate: GateResult = {
  releaseVersion: release.version,
  threshold: 0.8,
  decisions: [
    { featureId: "section-1-im", reason: "eligible", automatable: true, confidence: 0.85, evidenceIds: ["ev-im"] },
    { featureId: "section-2-section", reason: "no_evidence", automatable: false, evidenceIds: [] },
    { featureId: "section-3-agent", reason: "eligible", automatable: true, confidence: 0.9, evidenceIds: ["ev-agent"] },
  ],
};

const servers: Server[] = [];
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(
  options: { managementStatus?: number; managementSuccess?: boolean; decisions?: unknown } = {},
): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/window")) {
      response.writeHead(200).end("ready");
      return;
    }
    if (request.url === "/api/perception/management") {
      response.writeHead(options.managementStatus ?? 200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        success: options.managementSuccess ?? true,
        data: {
          decisions: options.decisions ?? [{ candidateKeys: ["ask_user_to_choose_target", "role-agent"] }],
        },
      }));
      return;
    }
    response.writeHead(404).end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind");
  return `http://127.0.0.1:${address.port}`;
}

function fakeRunner(
  origin: string,
  options: { startError?: unknown; stopError?: unknown; onStop?: () => void } = {},
) {
  let stops = 0;
  const runner: DesktopRunnerPort & { readonly processGroupId: number; readonly stops: number } = {
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
  return runner;
}

const ownedPort = async (file: string): Promise<string> => file === "lsof" ? "99\n" : " 4242\n";

const validRecording = Buffer.from([0, 0, 0, 20, ...Buffer.from("ftypqt  ")]);

async function recordingDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "showcraft-recording-"));
  temporaryPaths.push(directory);
  return directory;
}

function recorder(
  mode:
    | "success"
    | "failure"
    | "missing"
    | "empty"
    | "corrupt"
    | "hang"
    | "timed-out-valid"
    | "timed-out-missing",
) {
  return async (file: string, args: readonly string[]): Promise<string> => {
    expect(file).toBe("/usr/sbin/screencapture");
    expect(args.slice(0, 6)).toEqual(["-v", "-V", "1", "-D", "1", args[5]]);
    const output = args.at(-1)!;
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
    if (mode === "success" || mode === "timed-out-valid") await writeFile(output, validRecording);
    if (mode === "timed-out-valid" || mode === "timed-out-missing") {
      throw new Error("recording timed out after 1000ms");
    }
    return "";
  };
}

describe("createStartUpOSDemoActions", () => {
  it("rejects recording timeouts outside Node's supported timer range", () => {
    expect(() => createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      recordingDurationSeconds: 2_147_484,
      recordingGraceMs: 0,
    })).toThrow(/safe integer no greater than 2147483647ms/);
    expect(() => createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      recordingDurationSeconds: 1,
      recordingGraceMs: Number.MAX_SAFE_INTEGER,
    })).toThrow(/safe integer no greater than 2147483647ms/);
  });

  it("executes the supported eligible action and records skipped gate outcomes", async () => {
    const origin = await fixture();
    const runner = fakeRunner(origin);
    const demo = createStartUpOSDemoActions({ startupOsRoot: "/unused", runner, command: ownedPort });

    const actions = await demo(release, gate);

    expect(actions.find((action) => action.featureId === "section-1-im")).toMatchObject({
      status: "executed",
      reason: "eligible",
      evidenceIds: ["ev-im"],
      sourceRef: release.features[0]!.sourceRef,
      observations: {
        window_route_status: 200,
        management_api_status: 200,
        management_shape_valid: true,
        ask_user_candidate_present: true,
      },
    });
    expect(actions.find((action) => action.featureId === "section-2-section")).toMatchObject({
      status: "skipped",
      reason: "no_evidence",
      evidenceIds: [],
    });
    expect(actions.find((action) => action.featureId === "section-3-agent")).toMatchObject({
      status: "skipped",
      reason: "unsupported_feature",
      evidenceIds: ["ev-agent"],
    });
    expect(runner.stops).toBe(1);
  });

  it("maps a management 503 to a failed action without pseudo-success", async () => {
    const origin = await fixture({ managementStatus: 503 });
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(origin),
      command: ownedPort,
    });
    const actions = await demo(release, gate);
    expect(actions.find((action) => action.featureId === "section-1-im")).toMatchObject({
      status: "failed",
      reason: "action_failed",
      observations: { management_api_status: 503 },
    });
  });

  it("records an eligible action and adds a validated relative media reference", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("success"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    const action = (await demo(release, gate)).find(
      (candidate) => candidate.featureId === "section-1-im",
    );
    expect(action).toMatchObject({
      status: "executed",
      reason: "eligible",
      media: { file: "recording-section-1-im.mov" },
    });
    const media = await readFile(join(runDirectory, "recording-section-1-im.mov"));
    expect(media.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });

  it("maps recorder failure to recording_failed while preserving observations", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("failure"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    const action = (await demo(release, gate)).find(
      (candidate) => candidate.featureId === "section-1-im",
    );
    expect(action).toMatchObject({
      status: "failed",
      reason: "recording_failed",
      observations: { window_route_status: 200, management_api_status: 200 },
    });
    expect(action).not.toHaveProperty("media");
    expect(action?.diagnostics).toContain("exit_code=1");
    expect(action?.diagnostics).toContain("screen capture permission denied");
    expect(await readdir(runDirectory)).toEqual([]);
  });

  it("handles a recorder rejecting with an undefined value", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: async () => Promise.reject(undefined),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    const action = (await demo(release, gate)).find(
      (candidate) => candidate.featureId === "section-1-im",
    );
    expect(action).toMatchObject({
      status: "failed",
      reason: "recording_failed",
      diagnostics: "undefined",
    });
  });

  it.each(["missing", "empty", "corrupt"] as const)(
    "quarantines an invalid %s recording without publishing a media reference",
    async (mode) => {
      const origin = await fixture();
      const runDirectory = await recordingDirectory();
      const demo = createStartUpOSDemoActions({
        startupOsRoot: "/unused",
        runDirectory,
        runner: fakeRunner(origin),
        command: ownedPort,
        recorder: recorder(mode),
        recordingDurationSeconds: 1,
        recordingGraceMs: 0,
      });

      const action = (await demo(release, gate)).find(
        (candidate) => candidate.featureId === "section-1-im",
      );
      expect(action).toMatchObject({ status: "failed", reason: "recording_failed" });
      expect(action).not.toHaveProperty("media");
      const files = await readdir(runDirectory);
      if (mode === "missing") {
        expect(files).toEqual([]);
      } else {
        expect(files).toEqual(["recording-section-1-im.mov.failed"]);
      }
    },
  );

  it("keeps valid timeout output as media evidence", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("timed-out-valid"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    expect((await demo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "executed", media: { file: "recording-section-1-im.mov" } });
  });

  it("fails a timed-out recorder that produces no valid output", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("timed-out-missing"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    expect((await demo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", reason: "recording_failed" });
    expect(await readdir(runDirectory)).toEqual([]);
  });

  it("bounds a recorder that never settles and stops the runner afterward", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const runner = fakeRunner(origin);
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner,
      command: ownedPort,
      recorder: recorder("hang"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    const action = (await demo(release, gate)).find(
      (candidate) => candidate.featureId === "section-1-im",
    );
    expect(action).toMatchObject({ status: "failed", reason: "recording_failed" });
    expect(action?.diagnostics).toContain("recording timed out after 1000ms");
    expect(runner.stops).toBe(1);
    expect(await readdir(runDirectory)).toEqual([]);
  });

  it("reports recording_failed on non-macOS without invoking screencapture", async () => {
    const platform = vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    try {
      const origin = await fixture();
      const runDirectory = await recordingDirectory();
      const demo = createStartUpOSDemoActions({
        startupOsRoot: "/unused",
        runDirectory,
        runner: fakeRunner(origin),
        command: ownedPort,
        recordingDurationSeconds: 1,
        recordingGraceMs: 0,
      });

      const action = (await demo(release, gate)).find(
        (candidate) => candidate.featureId === "section-1-im",
      );
      expect(action).toMatchObject({
        status: "failed",
        reason: "recording_failed",
        diagnostics: "screen recording is supported only on macOS",
      });
      expect(action).not.toHaveProperty("media");
    } finally {
      platform.mockRestore();
    }
  });

  it("keeps successful recording as evidence when the observed action fails", async () => {
    const origin = await fixture({ managementStatus: 503 });
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("success"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    expect((await demo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({
        status: "failed",
        reason: "action_failed",
        observations: { management_api_status: 503 },
        media: { file: "recording-section-1-im.mov" },
      });
    await expect(stat(join(runDirectory, "recording-section-1-im.mov"))).resolves.toMatchObject({
      size: validRecording.length,
    });
  });

  it("keeps both action and recording diagnostics when both fail", async () => {
    const origin = await fixture({ managementStatus: 503 });
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("failure"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    const action = (await demo(release, gate)).find(
      (candidate) => candidate.featureId === "section-1-im",
    );
    expect(action).toMatchObject({ status: "failed", reason: "action_failed" });
    expect(action?.diagnostics).toContain("management_api_status=503");
    expect(action?.diagnostics).toContain("recording_failure=");
    expect(action?.diagnostics).toContain("screen capture permission denied");
    expect(action).not.toHaveProperty("media");
    expect(await readdir(runDirectory)).not.toContain("recording-section-1-im.mov");
  });

  it("retains failed-action media when runner stop also fails", async () => {
    const origin = await fixture({ managementStatus: 503 });
    const runDirectory = await recordingDirectory();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin, { stopError: new Error("runner would not stop") }),
      command: ownedPort,
      recorder: recorder("success"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    });

    const action = (await demo(release, gate)).find(
      (candidate) => candidate.featureId === "section-1-im",
    );
    expect(action).toMatchObject({
      status: "failed",
      reason: "action_failed",
      media: { file: "recording-section-1-im.mov" },
    });
    expect(action?.diagnostics).toContain("management_api_status=503");
    expect(action?.diagnostics).toContain("stop_failure=runner would not stop");
    await expect(stat(join(runDirectory, "recording-section-1-im.mov"))).resolves.toMatchObject({
      size: validRecording.length,
    });
  });

  it("forwards the calculated timeout and waits for recorder process termination before stop", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    let recorderProcess: ChildProcess | undefined;
    let forwardedTimeout: number | undefined;
    let terminatedBeforeStop = false;
    const controlledRecorder = async (
      _file: string,
      _args: readonly string[],
      options?: { timeoutMs?: number },
    ): Promise<string> => {
      forwardedTimeout = options?.timeoutMs;
      if (forwardedTimeout === undefined) throw new Error("missing timeout");
      recorderProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        stdio: "ignore",
      });
      return new Promise((_, reject) => {
        const timer = setTimeout(() => recorderProcess!.kill("SIGKILL"), forwardedTimeout);
        recorderProcess!.once("close", (_code, signal) => {
          clearTimeout(timer);
          const error = new Error("recording child timed out") as Error & {
            killed: boolean;
            signal?: string;
          };
          error.killed = true;
          error.signal = signal ?? undefined;
          reject(error);
        });
      });
    };
    const runner = fakeRunner(origin, {
      onStop: () => {
        terminatedBeforeStop =
          recorderProcess !== undefined &&
          (recorderProcess.exitCode !== null || recorderProcess.signalCode !== null);
      },
    });
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner,
      command: ownedPort,
      recorder: controlledRecorder,
      recordingDurationSeconds: 1,
      recordingGraceMs: 25,
    });

    expect((await demo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", reason: "recording_failed" });
    expect(forwardedTimeout).toBe(1_025);
    expect(terminatedBeforeStop).toBe(true);
    expect(recorderProcess?.signalCode).toBe("SIGKILL");
  });

  it("fails when the management response lacks decision candidateKeys", async () => {
    const origin = await fixture({ decisions: [{}] });
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(origin),
      command: ownedPort,
    });
    const actions = await demo(release, gate);
    expect(actions.find((action) => action.featureId === "section-1-im")).toMatchObject({
      status: "failed",
      observations: { management_shape_valid: false, ask_user_candidate_present: false },
    });
  });

  it("rejects unsuccessful and non-string management payloads", async () => {
    const failedOrigin = await fixture({ managementSuccess: false });
    const failedDemo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(failedOrigin),
      command: ownedPort,
    });
    expect((await failedDemo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", observations: { management_shape_valid: false } });

    const malformedOrigin = await fixture({
      decisions: [{ candidateKeys: ["ask_user_to_choose_target", 42] }],
    });
    const malformedDemo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(malformedOrigin),
      command: ownedPort,
    });
    expect((await malformedDemo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", observations: { management_shape_valid: false } });
  });

  it("refuses a listener outside the runner process group", async () => {
    const origin = await fixture();
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(origin),
      command: async (file) => file === "lsof" ? "99\n" : " 7000\n",
    });
    const actions = await demo(release, gate);
    expect(actions.find((action) => action.featureId === "section-1-im")).toMatchObject({
      status: "failed",
      reason: "port_owner_mismatch",
      observations: { port_owner_in_group: false },
    });
  });

  it("propagates start failures after the mandatory stop attempt", async () => {
    const origin = await fixture();
    const error = new DesktopRunnerError("readiness", "phase=readiness", "not ready");
    const runner = fakeRunner(origin, { startError: error });
    const demo = createStartUpOSDemoActions({ startupOsRoot: "/unused", runner, command: ownedPort });
    await expect(demo(release, gate)).rejects.toThrow(/phase=readiness/);
    expect(runner.stops).toBe(1);
  });

  it("does not lose falsey start or stop rejections", async () => {
    const origin = await fixture();
    const startRunner = fakeRunner(origin, { startError: undefined });
    const startDemo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: startRunner,
      command: ownedPort,
    });
    await expect(startDemo(release, gate)).rejects.toThrow(/undefined/);

    const stopRunner = fakeRunner(origin, { stopError: false });
    const stopDemo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: stopRunner,
      command: ownedPort,
    });
    expect((await stopDemo(release, gate)).find((action) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", reason: "stop_failed" });
  });

  it("turns stop failure into a bounded failed record", async () => {
    const origin = await fixture();
    const stopError = new DesktopRunnerError("stop", "x".repeat(3000), "leftovers");
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(origin, { stopError }),
      command: ownedPort,
    });
    const actions = await demo(release, gate);
    const action = actions.find((candidate) => candidate.featureId === "section-1-im")!;
    expect(action).toMatchObject({ status: "failed", reason: "stop_failed" });
    expect(action.diagnostics?.length).toBeLessThanOrEqual(2048);
  });

  it("does not start the runner when every decision is ineligible", async () => {
    const origin = await fixture();
    const runDirectory = await recordingDirectory();
    const runner = fakeRunner(origin, { startError: new Error("must not start") });
    const fakeRecorder = vi.fn(recorder("success"));
    const demo = createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner,
      command: ownedPort,
      recorder: fakeRecorder,
      recordingDurationSeconds: 1,
    });
    const actions = await demo(release, {
      ...gate,
      decisions: gate.decisions.map((decision) => ({
        featureId: decision.featureId,
        reason: "no_evidence" as const,
        automatable: false,
        evidenceIds: [],
      })),
    });
    expect(actions.every((action) => action.reason === "no_evidence")).toBe(true);
    expect(runner.stops).toBe(0);
    expect(fakeRecorder).not.toHaveBeenCalled();
  });

  it("copies below-threshold evidence into a skipped record", async () => {
    const origin = await fixture();
    const runner = fakeRunner(origin, { startError: new Error("must not start") });
    const demo = createStartUpOSDemoActions({ startupOsRoot: "/unused", runner, command: ownedPort });
    const actions = await demo(release, {
      releaseVersion: release.version,
      threshold: 0.8,
      decisions: [{
        featureId: "section-1-im",
        reason: "below_threshold",
        automatable: false,
        confidence: 0.7,
        evidenceIds: ["ev-im"],
      }],
    });
    expect(actions[0]).toMatchObject({
      status: "skipped",
      reason: "below_threshold",
      evidenceIds: ["ev-im"],
    });
    expect(runner.stops).toBe(0);
  });

  it("produces byte-identical records for repeated observations", async () => {
    const origin = await fixture();
    const run = async () => createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runner: fakeRunner(origin),
      command: ownedPort,
    })(release, gate);
    expect(Buffer.from(stableJsonBytes(await run())).equals(Buffer.from(stableJsonBytes(await run())))).toBe(true);
  });

  it("keeps recorded action JSON byte-identical across independent run directories", async () => {
    const origin = await fixture();
    const firstDirectory = await recordingDirectory();
    const secondDirectory = await recordingDirectory();
    const run = async (runDirectory: string) => createStartUpOSDemoActions({
      startupOsRoot: "/unused",
      runDirectory,
      runner: fakeRunner(origin),
      command: ownedPort,
      recorder: recorder("success"),
      recordingDurationSeconds: 1,
      recordingGraceMs: 0,
    })(release, gate);

    const first = await run(firstDirectory);
    const second = await run(secondDirectory);
    expect(Buffer.from(stableJsonBytes(first)).equals(Buffer.from(stableJsonBytes(second)))).toBe(true);
    for (const directory of [firstDirectory, secondDirectory]) {
      const media = await readFile(join(directory, "recording-section-1-im.mov"));
      expect(media.length).toBeGreaterThan(0);
      expect(media.subarray(4, 8).toString("ascii")).toBe("ftyp");
    }
  });
});
