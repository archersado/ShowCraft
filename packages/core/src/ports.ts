import type {
  EntryPointCandidate,
  EvidencePack,
  GateResult,
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

/**
 * What the scene planner knows about the confidence gate's outcome. When a
 * gate ran, `gatedFeatureIds` carries every feature the gate marked
 * not-automatable so the planner can narrate a downgrade for them
 * (`narrationSource: "fallback"`). Absent when no gate ran — planners keep
 * their pre-gate behavior in that case.
 */
export type ScenePlanningContext = {
  gatedFeatureIds?: ReadonlySet<string>;
};

export type ScenePlannerPort = (
  release: ReleaseBrief,
  context?: ScenePlanningContext,
) => Promise<ScenePlan> | ScenePlan;

export type RendererPort = (
  release: ReleaseBrief,
  scenePlan: ScenePlan,
) => Promise<RenderManifest> | RenderManifest;

/**
 * Lifecycle outcome of a successful desktop `start()`: the app is ready to be
 * driven (renderer serving HTTP, Electron main process alive) and `rendererUrl`
 * is the address the readiness gate confirmed.
 */
export type DesktopStartInfo = {
  rendererUrl: string;
};

/**
 * Desktop runner lifecycle port (epic 3). `start()` resolves only once the
 * desktop app is ready — readiness is the success condition, not a separate
 * check — and rejects only after the spawned process tree has been fully
 * reclaimed (zero leftover processes). `stop()` is an idempotent, whole
 * process-group shutdown: calling it before start, after stop, or after the
 * app exited on its own is a success no-op. Demo-action execution stays out of
 * this contract for now (story 3.2).
 */
export type DesktopRunnerPort = {
  start(): Promise<DesktopStartInfo>;
  stop(): Promise<void>;
};

/** The lifecycle stage a `DesktopRunnerError` was raised in. */
export type DesktopRunnerErrorPhase = "precondition" | "spawn" | "readiness" | "stop";

/**
 * Error contract for desktop lifecycle failures. `phase` maps each failure to
 * its pipeline stage (so orchestrator integration in 3.2 can surface it as a
 * StageFailure without re-deriving), and `diagnostics` is a human-readable
 * multiline report: elapsed time, renderer URL, output tail excerpts and —
 * where relevant — a process-group snapshot.
 */
export class DesktopRunnerError extends Error {
  constructor(
    readonly phase: DesktopRunnerErrorPhase,
    readonly diagnostics: string,
    message: string,
  ) {
    super(message);
    this.name = "DesktopRunnerError";
  }
}

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

/**
 * Optional gate port: classify each feature's entry-point candidates against
 * the confidence threshold. Implementations wrap the core pure function
 * `applyConfidenceGate`; the orchestrator runs the gate stage only when this
 * port is provided (mock pipelines keep their exact pre-gate artifact set).
 */
export type ConfidenceGatePort = (
  release: ReleaseBrief,
  evidence: EvidenceResult,
) => Promise<GateResult> | GateResult;

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
  return (release, context) => {
    const gated = context?.gatedFeatureIds;
    return {
      releaseVersion: release.version,
      scenes: release.features.map((feature) => ({
        id: `scene-${feature.id}`,
        featureId: feature.id,
        title: feature.title,
        narration: feature.narration,
        narrationSource: gated?.has(feature.id) ? ("fallback" as const) : ("narration" as const),
        plannedDurationSeconds: 15,
      })),
    };
  };
}

export function createMockRenderer(): RendererPort {
  return (release, scenePlan) => ({
    format: "showcraft.mock-manifest/v1",
    releaseVersion: release.version,
    scenes: scenePlan.scenes,
  });
}
