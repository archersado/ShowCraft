import type {
  EntryPointCandidate,
  EvidencePack,
  ReleaseBrief,
  RenderManifest,
  ScenePlan,
} from "./domain.js";

/**
 * Provider ports for the mock release pipeline. Ports are plain function
 * contracts over domain objects — no I/O here. Real adapters (StartUpOS,
 * Edge TTS, Remotion) implement the same shapes in later epics; the
 * orchestrator only knows these types.
 */

export type ReleaseSourcePort = () => Promise<ReleaseBrief> | ReleaseBrief;

export type ScenePlannerPort = (release: ReleaseBrief) => Promise<ScenePlan> | ScenePlan;

export type RendererPort = (
  release: ReleaseBrief,
  scenePlan: ScenePlan,
) => Promise<RenderManifest> | RenderManifest;

export type EvidenceResult = {
  pack: EvidencePack;
  entryPoints: EntryPointCandidate[];
};

/**
 * Optional evidence port: retrieve code evidence for a release's features
 * from an allowed Git repository. Returning empty entries is the explicit
 * "no evidence source" outcome; throwing fails the evidence stage.
 */
export type CodeEvidencePort = (release: ReleaseBrief) => Promise<EvidenceResult> | EvidenceResult;

/** Empty evidence pack for releases without a code evidence source. */
export function createMockCodeEvidence(): CodeEvidencePort {
  return (release) => ({ pack: { releaseVersion: release.version, entries: [] }, entryPoints: [] });
}

const MOCK_RELEASE: ReleaseBrief = {
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

export function createMockReleaseSource(): ReleaseSourcePort {
  return () => MOCK_RELEASE;
}

export function createMockScenePlanner(): ScenePlannerPort {
  return (release) => ({
    releaseVersion: release.version,
    scenes: release.features.map((feature) => ({
      id: `scene-${feature.id}`,
      featureId: feature.id,
      title: feature.title,
      narration: feature.narration,
      narrationSource: "narration",
      plannedDurationSeconds: 15,
    })),
  });
}

export function createMockRenderer(): RendererPort {
  return (release, scenePlan) => ({
    format: "showcraft.mock-manifest/v1",
    releaseVersion: release.version,
    scenes: scenePlan.scenes,
  });
}
