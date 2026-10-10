import {
  DomainValidationError,
  entryPointCandidateSchema,
  evidencePackSchema,
  gateResultSchema,
  releaseBriefSchema,
  renderManifestSchema,
  runRecordSchema,
  scenePlanSchema,
  type EntryPointCandidate,
  type EvidencePack,
  type GateResult,
  type ReleaseBrief,
  type RenderManifest,
  type RunRecord,
  type RunStatus,
  type ScenePlan,
} from "./domain.js";
import { parseWithSchema, stableJsonBytes } from "./serialization.js";

/**
 * Staged, file-backed run store core. Pure logic: it validates artifacts
 * against the domain schemas, tracks one-way status transitions, and emits
 * the stable JSON bytes for the CLI to persist. Filesystem access lives in
 * the CLI adapter (packages/cli/src/runStore.ts).
 */

/** Stages whose artifacts the release pipeline persists. Evidence and gate run
 * only when the corresponding ports are provided; the mock pipeline skips both. */
export type RunStage = "release" | "evidence" | "gate" | "scenePlan" | "manifest";

export const runStageOrder: readonly RunStage[] = [
  "release",
  "evidence",
  "gate",
  "scenePlan",
  "manifest",
];

export const stageFileNames: Record<RunStage, string> = {
  release: "release.json",
  evidence: "evidence.json",
  gate: "gate.json",
  scenePlan: "scene.json",
  manifest: "manifest.json",
};

export type StageFailure = {
  stage: RunStage;
  reason: string;
};

export type RunStoreFile = {
  fileName: string;
  bytes: Uint8Array;
};

export type RunStoreEvent =
  | { kind: "file"; file: RunStoreFile }
  | { kind: "run-record"; file: RunStoreFile };

export class IllegalRunTransitionError extends Error {
  constructor(readonly from: RunStatus, readonly to: RunStatus) {
    super(`Illegal run status transition: ${from} -> ${to}`);
    this.name = "IllegalRunTransitionError";
  }
}

export class RunAlreadyExistsError extends Error {
  constructor(readonly runId: string) {
    super(`Run directory for run "${runId}" already exists`);
    this.name = "RunAlreadyExistsError";
  }
}

const ALLOWED_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  pending: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

/** A schema-validated artifact awaiting persistence, tagged by stage. */
export type StageArtifact =
  | { stage: "release"; value: ReleaseBrief }
  | { stage: "evidence"; value: { pack: EvidencePack; entryPoints: EntryPointCandidate[] } }
  | { stage: "gate"; value: GateResult }
  | { stage: "scenePlan"; value: ScenePlan }
  | { stage: "manifest"; value: RenderManifest };

export class RunStoreCore {
  private readonly runId: string;
  private status: RunStatus = "pending";
  private failure: { stage: string; reason: string } | undefined;
  private readonly pendingFiles: RunStoreFile[] = [];

  constructor(runId: string) {
    if (!runId || runId.trim() === "") {
      throw new Error("Run id must not be empty");
    }
    this.runId = runId;
  }

  get id(): string {
    return this.runId;
  }

  get currentStatus(): RunStatus {
    return this.status;
  }

  get currentFailure(): { stage: string; reason: string } | undefined {
    return this.failure;
  }

  /** Take the run's artifacts and return the bytes that must be persisted. */
  collectFiles(): RunStoreFile[] {
    return [...this.pendingFiles, { fileName: "run.json", bytes: this.runRecordBytes() }];
  }

  /**
   * Advance status one step along pending → running → completed|failed.
   * Failed and completed are terminal; any other move is a diagnostic error.
   */
  transition(to: RunStatus): void {
    if (!ALLOWED_TRANSITIONS[this.status].includes(to)) {
      throw new IllegalRunTransitionError(this.status, to);
    }
    this.status = to;
  }

  /**
   * Record a stage artifact: validate it against its schema, stage the stable
   * bytes for persistence, and mark the run running. Invalid artifacts throw
   * DomainValidationError with field paths; nothing is staged.
   */
  recordArtifact(artifact: StageArtifact): RunStoreEvent {
    if (artifact.stage === "release") {
      const result = parseWithSchema(releaseBriefChecker, artifact.value);
      if (!result.success) {
        throw new DomainValidationError(result.issues);
      }
    } else if (artifact.stage === "evidence") {
      const result = parseWithSchema(evidencePackChecker, artifact.value.pack);
      if (!result.success) {
        throw new DomainValidationError(result.issues);
      }
      for (const candidate of artifact.value.entryPoints) {
        const candidateResult = parseWithSchema(entryPointChecker, candidate);
        if (!candidateResult.success) {
          throw new DomainValidationError(candidateResult.issues);
        }
      }
    } else if (artifact.stage === "gate") {
      const result = parseWithSchema(gateChecker, artifact.value);
      if (!result.success) {
        throw new DomainValidationError(result.issues);
      }
    } else if (artifact.stage === "scenePlan") {
      const result = parseWithSchema(scenePlanChecker, artifact.value);
      if (!result.success) {
        throw new DomainValidationError(result.issues);
      }
    } else {
      const result = parseWithSchema(manifestChecker, artifact.value);
      if (!result.success) {
        throw new DomainValidationError(result.issues);
      }
    }

    const file: RunStoreFile = {
      fileName: stageFileNames[artifact.stage],
      // The evidence artifact persists as its pack plus entry-point list;
      // entryPoints are keyed inside the file for single-file round trips.
      bytes:
        artifact.stage === "evidence"
          ? stableJsonBytes({ ...artifact.value.pack, entryPoints: artifact.value.entryPoints })
          : stableJsonBytes(artifact.value),
    };
    this.pendingFiles.push(file);
    if (this.status === "pending") {
      this.transition("running");
    }
    return { kind: "file", file };
  }

  /** Mark the run completed; every staged artifact must already be recorded. */
  complete(): RunStoreEvent {
    this.transition("completed");
    return { kind: "run-record", file: { fileName: "run.json", bytes: this.runRecordBytes() } };
  }

  /** Mark the run failed at a stage; prior artifacts are never discarded. */
  fail(stage: RunStage, reason: string): RunStoreEvent {
    this.transition("failed");
    this.failure = { stage, reason: reason || "unknown failure" };
    return { kind: "run-record", file: { fileName: "run.json", bytes: this.runRecordBytes() } };
  }

  /** Snapshot the current run record for diagnostics or persistence. */
  toRunRecord(): RunRecord {
    return runRecordSchema.parse({
      format: "showcraft.mock-run/v1",
      runId: this.runId,
      status: this.status,
      artifacts: this.pendingFiles.map((file) => file.fileName),
      ...(this.failure ? { failure: this.failure } : {}),
    });
  }

  private runRecordBytes(): Uint8Array {
    return stableJsonBytes(this.toRunRecord());
  }
}

const releaseBriefChecker = releaseBriefSchema;
const evidencePackChecker = evidencePackSchema;
const entryPointChecker = entryPointCandidateSchema;
const gateChecker = gateResultSchema;
const scenePlanChecker = scenePlanSchema;
const manifestChecker = renderManifestSchema;
