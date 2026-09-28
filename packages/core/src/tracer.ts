import type {
  ReleaseBrief,
  RenderManifest,
  RunRecord,
  Scene,
  ScenePlan,
} from "./domain.js";
import {
  renderManifestSchema,
  releaseBriefSchema,
  runRecordSchema,
  scenePlanSchema,
} from "./domain.js";

/**
 * A deliberately small, dependency-light tracer. Its output now conforms to
 * the formal domain schemas so downstream stories (run store, providers) can
 * rely on the same contracts. Provider orchestration stays out.
 */

export type MockTracerResult = {
  release: ReleaseBrief;
  manifest: RenderManifest;
  run: RunRecord;
};

function buildScenePlan(release: ReleaseBrief): ScenePlan {
  const scenes: Scene[] = release.features.map((feature) => ({
    id: `scene-${feature.id}`,
    featureId: feature.id,
    title: feature.title,
    narration: feature.narration,
    narrationSource: "narration",
    plannedDurationSeconds: 15,
  }));
  return { releaseVersion: release.version, scenes };
}

export function createMockTracerResult(): MockTracerResult {
  const release: ReleaseBrief = {
    version: "demo",
    source: "mock://showcraft/demo-release",
    features: [
      {
        id: "mock-feature",
        title: "示例功能介绍",
        narration: "这是 ShowCraft 在无需外部服务时生成的示例功能介绍。",
      },
    ],
  };

  const scenePlan = buildScenePlan(release);

  const manifest: RenderManifest = {
    format: "showcraft.mock-manifest/v1",
    releaseVersion: release.version,
    scenes: scenePlan.scenes,
  };

  const run: RunRecord = {
    format: "showcraft.mock-run/v1",
    runId: "mock-tracer-demo",
    status: "completed",
    artifacts: ["release.json", "manifest.json"],
  };

  // Guard the contract at construction time; the mock data must always parse.
  releaseBriefSchema.parse(release);
  scenePlanSchema.parse(scenePlan);
  renderManifestSchema.parse(manifest);
  runRecordSchema.parse(run);

  return { release, manifest, run };
}
