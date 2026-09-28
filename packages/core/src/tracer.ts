export type MockRelease = {
  version: string;
  source: string;
  features: Array<{
    id: string;
    title: string;
    narration: string;
  }>;
};

export type MockManifest = {
  format: "showcraft.mock-manifest/v1";
  releaseVersion: string;
  scenes: Array<{
    id: string;
    featureId: string;
    title: string;
    narration: string;
  }>;
};

export type MockRun = {
  format: "showcraft.mock-run/v1";
  status: "completed";
  artifacts: ["release.json", "manifest.json"];
};

export type MockTracerResult = {
  release: MockRelease;
  manifest: MockManifest;
  run: MockRun;
};

/**
 * A deliberately small, dependency-free tracer. Formal domain schemas and
 * provider orchestration are introduced by later stories.
 */
export function createMockTracerResult(): MockTracerResult {
  const release: MockRelease = {
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

  const manifest: MockManifest = {
    format: "showcraft.mock-manifest/v1",
    releaseVersion: release.version,
    scenes: release.features.map((feature) => ({
      id: `scene-${feature.id}`,
      featureId: feature.id,
      title: feature.title,
      narration: feature.narration,
    })),
  };

  return {
    release,
    manifest,
    run: {
      format: "showcraft.mock-run/v1",
      status: "completed",
      artifacts: ["release.json", "manifest.json"],
    },
  };
}
