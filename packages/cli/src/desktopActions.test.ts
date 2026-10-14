import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

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

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
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

function fakeRunner(origin: string, options: { startError?: unknown; stopError?: unknown } = {}) {
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
      if ("stopError" in options) throw options.stopError;
    },
  };
  return runner;
}

const ownedPort = async (file: string): Promise<string> => file === "lsof" ? "99\n" : " 4242\n";

describe("createStartUpOSDemoActions", () => {
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
    const runner = fakeRunner(origin, { startError: new Error("must not start") });
    const demo = createStartUpOSDemoActions({ startupOsRoot: "/unused", runner, command: ownedPort });
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
});
