import {
  DomainValidationError,
  narrationArtifactSchema,
  renderManifestSchema,
  scenePlanSchema,
  validateReleasePackageRelations,
  type DemoActions,
  type EvidencePack,
  type GateResult,
  type NarrationArtifact,
  type ReleaseBrief,
  type RenderManifest,
  type ScenePlan,
} from "./domain.js";
import { parseWithSchema } from "./serialization.js";
import type { RunStage } from "./runStore.js";
import { RunStoreCore } from "./runStore.js";
import type {
  CodeEvidencePort,
  ConfidenceGatePort,
  DesktopDemoPort,
  NarrationPort,
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
  /** Optional: when absent the desktop stage is skipped entirely. */
  desktopDemo?: DesktopDemoPort;
  /** Optional: when absent narration generation is skipped entirely. */
  narration?: NarrationPort;
};

/** Tracks how far the pipeline progressed for accurate failure attribution. */
type StageProgress = "release" | "evidence" | "gate" | "desktop" | "scenePlan" | "narration" | "manifest" | "completed";

export class StageFailure extends Error {
  constructor(
    readonly stage: RunStage,
    message: string,
  ) {
    super(message);
    this.name = "StageFailure";
  }
}

function parseScenePlan(value: unknown): ScenePlan {
  const result = parseWithSchema(scenePlanSchema, value);
  if (!result.success) throw new DomainValidationError(result.issues);
  return result.value;
}

function parseNarration(value: unknown): NarrationArtifact {
  const result = parseWithSchema(narrationArtifactSchema, value);
  if (!result.success) throw new DomainValidationError(result.issues);
  return result.value;
}

function parseManifest(value: unknown): RenderManifest {
  const result = parseWithSchema(renderManifestSchema, value);
  if (!result.success) throw new DomainValidationError(result.issues);
  return result.value;
}

/** Run the release pipeline to completion; returns the finished store. */
export async function runPipeline(ports: PipelinePorts, store: RunStoreCore): Promise<RunStoreCore> {
  let progress: StageProgress = "release";
  let release: ReleaseBrief | undefined;

  try {
    release = await ports.releaseSource();
    store.recordArtifact({ stage: "release", value: release });

    let gatedFeatureIds: ReadonlySet<string> | undefined;
    let evidencePack: EvidencePack | undefined;
    let gateResult: GateResult | undefined;
    let desktopActions: DemoActions | undefined;
    let narrationArtifact: NarrationArtifact | undefined;
    if (ports.codeEvidence) {
      progress = "evidence";
      const evidence = await ports.codeEvidence(release);
      store.recordArtifact({ stage: "evidence", value: evidence });
      evidencePack = evidence.pack;

      if (ports.confidenceGate) {
        progress = "gate";
        const gate = await ports.confidenceGate(release, evidence);
        store.recordArtifact({ stage: "gate", value: gate });
        gateResult = gate;
        gatedFeatureIds = new Set(
          gate.decisions.filter((decision) => !decision.automatable).map((d) => d.featureId),
        );
      }
    }

    if (ports.desktopDemo && gateResult) {
      progress = "desktop";
      const actions = await ports.desktopDemo(release, gateResult);
      const desktopArtifact = {
        releaseVersion: release.version,
        threshold: gateResult.threshold,
        actions,
      };
      desktopActions = desktopArtifact;
      validateReleasePackageRelations({
        release,
        ...(evidencePack ? { evidence: evidencePack } : {}),
        gate: gateResult,
        actions: desktopArtifact,
      });
      store.recordArtifact({
        stage: "desktop",
        value: desktopArtifact,
      });
      const failed = actions.find((action) => action.status === "failed");
      if (failed) {
        throw new StageFailure("desktop", failed.diagnostics ?? failed.reason);
      }
    }

    progress = "scenePlan";
    const scenePlan = parseScenePlan(await ports.scenePlanner(release, { gatedFeatureIds }));
    validateReleasePackageRelations({ release, scenePlan });
    store.recordArtifact({ stage: "scenePlan", value: scenePlan });

    if (ports.narration) {
      progress = "narration";
      const narration = parseNarration(await ports.narration(release, scenePlan));
      validateReleasePackageRelations({ release, scenePlan, narration });
      store.recordArtifact({ stage: "narration", value: narration });
      narrationArtifact = narration;
    }

    progress = "manifest";
    const manifest = parseManifest(await ports.renderer(release, scenePlan));
    validateReleasePackageRelations({
      release,
      ...(evidencePack ? { evidence: evidencePack } : {}),
      ...(gateResult ? { gate: gateResult } : {}),
      ...(desktopActions ? { actions: desktopActions } : {}),
      scenePlan,
      ...(narrationArtifact ? { narration: narrationArtifact } : {}),
      manifest,
    });
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
