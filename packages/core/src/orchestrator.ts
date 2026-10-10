import type { ReleaseBrief, RenderManifest } from "./domain.js";
import type { RunStage } from "./runStore.js";
import { RunStoreCore } from "./runStore.js";
import type {
  CodeEvidencePort,
  ConfidenceGatePort,
  RendererPort,
  ReleaseSourcePort,
  ScenePlannerPort,
} from "./ports.js";

/**
 * Stage-driven orchestration over provider ports. Each stage's artifact goes
 * through the run store (schema validation + stable bytes); a provider error
 * becomes a diagnostic failure at that stage while previously staged
 * artifacts are kept untouched.
 */

export type PipelinePorts = {
  releaseSource: ReleaseSourcePort;
  scenePlanner: ScenePlannerPort;
  renderer: RendererPort;
  /** Optional: when absent the evidence stage is skipped entirely (mock runs
   * keep their exact Story 1.6 artifact set). */
  codeEvidence?: CodeEvidencePort;
  /** Optional: when absent the gate stage is skipped entirely. Only meaningful
   * together with `codeEvidence` — the gate classifies evidence outcomes. */
  confidenceGate?: ConfidenceGatePort;
};

/** Tracks how far the pipeline progressed for accurate failure attribution. */
type StageProgress = "release" | "evidence" | "gate" | "scenePlan" | "manifest" | "completed";

export class StageFailure extends Error {
  constructor(
    readonly stage: RunStage,
    message: string,
  ) {
    super(message);
    this.name = "StageFailure";
  }
}

/** Run the release pipeline to completion; returns the finished store. */
export async function runPipeline(ports: PipelinePorts, store: RunStoreCore): Promise<RunStoreCore> {
  let progress: StageProgress = "release";
  let release: ReleaseBrief | undefined;

  try {
    release = await ports.releaseSource();
    store.recordArtifact({ stage: "release", value: release });

    let gatedFeatureIds: ReadonlySet<string> | undefined;
    if (ports.codeEvidence) {
      progress = "evidence";
      const evidence = await ports.codeEvidence(release);
      store.recordArtifact({ stage: "evidence", value: evidence });

      if (ports.confidenceGate) {
        progress = "gate";
        const gate = await ports.confidenceGate(release, evidence);
        store.recordArtifact({ stage: "gate", value: gate });
        gatedFeatureIds = new Set(
          gate.decisions.filter((decision) => !decision.automatable).map((d) => d.featureId),
        );
      }
    }

    progress = "scenePlan";
    const scenePlan = await ports.scenePlanner(release, { gatedFeatureIds });
    store.recordArtifact({ stage: "scenePlan", value: scenePlan });

    progress = "manifest";
    const manifest: RenderManifest = await ports.renderer(release, scenePlan);
    store.recordArtifact({ stage: "manifest", value: manifest });

    progress = "completed";
    store.complete();
  } catch (error) {
    if (progress === "completed") {
      throw error;
    }
    store.fail(progress, error instanceof Error ? error.message : String(error));
  }
  return store;
}
