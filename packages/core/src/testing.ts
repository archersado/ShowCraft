import type { ReleaseBrief, RenderManifest, Scene, ScenePlan } from "./domain.js";
import { RunStoreCore, type RunStoreFile } from "./runStore.js";
import { runPipeline, type PipelinePorts } from "./orchestrator.js";
import {
  createMockReleaseSource,
  createMockRenderer,
  createMockScenePlanner,
} from "./ports.js";

/**
 * Shared test fixtures. Not part of the public API surface (not exported
 * from index.ts) — tests import via relative paths. The canonical mock
 * release data lives in ports.ts; these helpers compose it.
 */

/** A two-feature release mirroring the v0.3.3 perception/IM routing sample. */
export const sampleRelease: ReleaseBrief = {
  version: "v0.3.3",
  source: "mock://showcraft/demo-release",
  features: [
    { id: "perception-routing", title: "感知路由", narration: "感知路由讲解" },
    { id: "im-routing", title: "IM 路由", narration: "IM 路由讲解" },
  ],
};

export function sampleScene(featureId: string, id: string): Scene {
  return {
    id,
    featureId,
    title: "镜头标题",
    narration: "镜头旁白",
    narrationSource: "narration",
    plannedDurationSeconds: 15,
  };
}

export function sampleScenePlan(release: ReleaseBrief = sampleRelease): ScenePlan {
  return {
    releaseVersion: release.version,
    scenes: release.features.map((feature) =>
      sampleScene(feature.id, `scene-${feature.id}`),
    ),
  };
}

export function sampleManifest(
  release: ReleaseBrief = sampleRelease,
  scenePlan: ScenePlan = sampleScenePlan(release),
): RenderManifest {
  return {
    format: "showcraft.mock-manifest/v1",
    releaseVersion: release.version,
    scenes: scenePlan.scenes,
  };
}

export function mockPorts(): PipelinePorts {
  return {
    releaseSource: createMockReleaseSource(),
    scenePlanner: createMockScenePlanner(),
    renderer: createMockRenderer(),
  };
}

/** Run the mock pipeline to completion and return its staged files. */
export async function completedRunStore(runId: string): Promise<RunStoreCore> {
  const store = new RunStoreCore(runId);
  await runPipeline(mockPorts(), store);
  return store;
}

export type { RunStoreFile };
