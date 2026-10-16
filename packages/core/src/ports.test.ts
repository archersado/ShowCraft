import { describe, expect, it } from "vitest";

import { createMockRenderer, createMockScenePlanner, DesktopRunnerError } from "./ports.js";
import type { DesktopRunnerPort } from "./ports.js";
import { mockPorts } from "./testing.js";
import { runPipeline } from "./orchestrator.js";
import { RunStoreCore } from "./runStore.js";
import type { ScenePlan } from "./index.js";

/**
 * Mock scene planner contract for story 2.4: features the gate marked
 * not-automatable get `narrationSource: "fallback"`; everything else stays
 * `narration`. Without a gate context the planner behaves exactly as in 2.3.
 */

const twoFeatureRelease = {
  version: "v0.3.3",
  source: "mock://showcraft/demo-release",
  features: [
    { id: "f-a", title: "功能 A", narration: "A 的旁白" },
    { id: "f-b", title: "功能 B", narration: "B 的旁白" },
  ],
};

describe("createMockScenePlanner with gate context", () => {
  it("downgrades gated features to fallback and keeps the rest on narration", () => {
    const planner = createMockScenePlanner();
    const plan: ScenePlan = planner(twoFeatureRelease, {
      gatedFeatureIds: new Set(["f-b"]),
    });
    expect(plan.scenes.map((scene) => scene.narrationSource)).toEqual([
      "generated", "narration", "fallback", "generated",
    ]);
    expect(plan.scenes.map((scene) => scene.plannedDurationSeconds)).toEqual([12, 16, 16, 12]);
  });

  it("keeps every scene on narration when the gated set is empty", () => {
    const planner = createMockScenePlanner();
    const plan = planner(twoFeatureRelease, { gatedFeatureIds: new Set() });
    expect(plan.scenes.filter((scene) => !["intro", "outro"].includes(scene.featureId))
      .every((scene) => scene.narrationSource === "narration")).toBe(true);
  });

  it("keeps 2.3 behavior byte-for-byte when no gate context is provided", () => {
    const planner = createMockScenePlanner();
    const withoutContext = planner(twoFeatureRelease);
    const withEmptyContext = planner(twoFeatureRelease, {});
    for (const plan of [withoutContext, withEmptyContext]) {
      expect(plan.scenes.filter((scene) => !["intro", "outro"].includes(scene.featureId))
        .every((scene) => scene.narrationSource === "narration")).toBe(true);
    }
    expect(JSON.stringify(withoutContext)).toBe(JSON.stringify(withEmptyContext));
  });

  it("threads the gated set through runPipeline: gate output drives scene narrationSource", async () => {
    const ports = mockPorts();
    ports.codeEvidence = (release) => ({
      pack: { releaseVersion: release.version, entries: [] },
      entryPoints: [],
    });
    ports.confidenceGate = (release) => ({
      releaseVersion: release.version,
      threshold: 0.8,
      decisions: release.features.map((feature) => ({
        featureId: feature.id,
        reason: "no_evidence" as const,
        automatable: false,
        evidenceIds: [],
      })),
    });
    const store = new RunStoreCore("ports-gate-fallback");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("completed");
    const sceneBytes = store
      .collectFiles()
      .find((file) => file.fileName === "scene.json")?.bytes;
    const plan = JSON.parse(new TextDecoder().decode(sceneBytes));
    expect(plan.scenes).toHaveLength(3);
    expect(plan.scenes[1]?.narrationSource).toBe("fallback");
  });

  it("renders one ordered volume for three features and two for six", () => {
    const planner = createMockScenePlanner();
    const renderer = createMockRenderer();
    for (const [count, expectedTotals] of [[3, [72]], [6, [76, 44]]] as const) {
      const release = {
        ...twoFeatureRelease,
        features: Array.from({ length: count }, (_, index) => ({
          id: `f-${index}`,
          title: `功能 ${index}`,
          narration: `旁白 ${index}`,
        })),
      };
      const plan = planner(release);
      const manifest = renderer(release, plan);
      expect(manifest.volumes?.map((volume) => volume.plannedTotalSeconds)).toEqual(expectedTotals);
      expect(manifest.volumes?.flatMap((volume) => volume.sceneIds)).toEqual(
        plan.scenes.map((scene) => scene.id),
      );
    }
  });
});

/**
 * Story 3.1 desktop runner port contract: a plain fake must satisfy the port
 * shape, and `DesktopRunnerError` must carry its phase + diagnostics fields
 * readable (they are the structured surface orchestrator integration in 3.2
 * maps to StageFailure).
 */
describe("DesktopRunnerPort contract", () => {
  it("accepts a fake runner implementation and exposes its start info", async () => {
    const runner: DesktopRunnerPort = {
      start: async () => ({ rendererUrl: "http://localhost:3100" }),
      stop: async () => {},
    };
    await expect(runner.start()).resolves.toEqual({ rendererUrl: "http://localhost:3100" });
    await expect(runner.stop()).resolves.toBeUndefined();
  });

  it("keeps DesktopRunnerError phase and diagnostics readable", () => {
    const error = new DesktopRunnerError("readiness", "phase=readiness\nelapsed_ms=1200", "not ready");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DesktopRunnerError");
    expect(error.phase).toBe("readiness");
    expect(error.diagnostics).toBe("phase=readiness\nelapsed_ms=1200");
    expect(error.message).toBe("not ready");
  });
});
