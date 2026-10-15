import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DemoActionRecord, DesktopDemoPort } from "@showcraft/core";

const desktopDemo = vi.hoisted(() => vi.fn<DesktopDemoPort>());
const desktopFactory = vi.hoisted(() => vi.fn());

vi.mock("./desktopActions.js", () => ({
  createStartUpOSDemoActions: (options: unknown) => {
    const implementation = desktopFactory(options);
    return typeof implementation === "function" ? implementation : desktopDemo;
  },
}));

import { runDemo } from "./main.js";
import {
  buildDesktopReleaseFixture,
  cleanupDesktopFixtures,
  fakeRecorder,
  fakeRunner,
  fixtureHttpServer,
  ownedPortCommand,
} from "./desktopFixtures.js";

const temporaryPaths: string[] = [];

afterEach(async () => {
  desktopDemo.mockReset();
  desktopFactory.mockReset();
  await cleanupDesktopFixtures();
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function recordsFor(
  release: Parameters<DesktopDemoPort>[0],
  gate: Parameters<DesktopDemoPort>[1],
  failureReason?: "action_failed" | "recording_failed",
): DemoActionRecord[] {
  return gate.decisions.map((decision) => {
    const sourceRef = release.features.find((feature) => feature.id === decision.featureId)!.sourceRef!;
    const base = { featureId: decision.featureId, sourceRef, evidenceIds: [...decision.evidenceIds] };
    if (decision.reason !== "eligible") {
      return { ...base, status: "skipped", reason: decision.reason };
    }
    if (decision.featureId !== "section-1-im") {
      return { ...base, status: "skipped", reason: "unsupported_feature" };
    }
    if (failureReason) {
      return {
        ...base,
        status: "failed",
        reason: failureReason,
        diagnostics: "fixture failure",
        ...(failureReason === "action_failed"
          ? { media: { file: "recording-section-1-im.mov" } }
          : {}),
      };
    }
    return {
      ...base,
      status: "executed",
      reason: "eligible",
      observations: {
        window_route_status: 200,
        management_api_status: 200,
        management_shape_valid: true,
        ask_user_candidate_present: true,
      },
      media: { file: "recording-section-1-im.mov" },
    };
  });
}

describe.runIf(process.platform !== "win32")("runDemo desktop composition", () => {
  it("persists media from the real desktop adapter driven by canonical fixtures", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-real-adapter-"));
    const fixture = await buildDesktopReleaseFixture();
    const origin = await fixtureHttpServer();
    temporaryPaths.push(root);
    const actual = await vi.importActual<typeof import("./desktopActions.js")>(
      "./desktopActions.js",
    );
    desktopFactory.mockImplementation((options: { startupOsRoot: string; runDirectory: string }) =>
      actual.createStartUpOSDemoActions({
        ...options,
        runner: fakeRunner(origin),
        command: ownedPortCommand,
        recorder: fakeRecorder("success"),
        recordingDurationSeconds: 1,
        recordingGraceMs: 0,
      }),
    );

    const result = await runDemo({
      outputRoot: root,
      runId: "desktop-real-adapter",
      source: fixture.changelogPath,
      desktopRoot: "/unused-by-fixture",
    });

    const actions = JSON.parse(await readFile(join(result.runDirectory, "actions.json"), "utf8"));
    expect(actions.actions).toContainEqual(expect.objectContaining({
      featureId: "section-1-im",
      status: "executed",
      media: { file: "recording-section-1-im.mov" },
    }));
    const media = await readFile(join(result.runDirectory, "recording-section-1-im.mov"));
    expect(media.subarray(4, 8).toString("ascii")).toBe("ftyp");
  }, 15_000);

  it("injects the desktop adapter and persists actions.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-compose-"));
    const fixture = await buildDesktopReleaseFixture();
    temporaryPaths.push(root);
    desktopDemo.mockImplementation((release, gate) => recordsFor(release, gate));

    const result = await runDemo({
      outputRoot: root,
      runId: "desktop-success",
      source: fixture.changelogPath,
      desktopRoot: "/unused-by-mock",
    });

    expect(desktopDemo).toHaveBeenCalledOnce();
    expect(desktopFactory).toHaveBeenCalledWith({
      startupOsRoot: "/unused-by-mock",
      runDirectory: result.runDirectory,
    });
    expect((await readdir(result.runDirectory)).sort()).toEqual([
      "actions.json",
      "evidence.json",
      "gate.json",
      "manifest.json",
      "release.json",
      "run.json",
      "scene.json",
    ]);
    const actions = JSON.parse(await readFile(join(result.runDirectory, "actions.json"), "utf8"));
    expect(actions.actions.find((action: { featureId: string }) => action.featureId === "section-1-im"))
      .toMatchObject({ media: { file: "recording-section-1-im.mov" } });
  }, 15_000);

  it("persists actions and run diagnostics before rejecting a failed desktop stage", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-failure-"));
    const fixture = await buildDesktopReleaseFixture();
    temporaryPaths.push(root);
    desktopDemo.mockImplementation((release, gate) => recordsFor(release, gate, "recording_failed"));

    await expect(
      runDemo({
        outputRoot: root,
        runId: "desktop-failure",
        source: fixture.changelogPath,
        desktopRoot: "/unused-by-mock",
      }),
    ).rejects.toThrow(/failed at desktop/);

    const actions = JSON.parse(await readFile(join(root, "desktop-failure", "actions.json"), "utf8"));
    const run = JSON.parse(await readFile(join(root, "desktop-failure", "run.json"), "utf8"));
    expect(actions.actions.find((action: { featureId: string }) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", reason: "recording_failed" });
    expect(actions.actions.find((action: { featureId: string }) => action.featureId === "section-1-im"))
      .not.toHaveProperty("media");
    expect(run).toMatchObject({ status: "failed", failure: { stage: "desktop" } });
    expect((await readdir(join(root, "desktop-failure"))).sort()).toEqual([
      "actions.json",
      "evidence.json",
      "gate.json",
      "release.json",
      "run.json",
    ]);
  }, 15_000);
});
