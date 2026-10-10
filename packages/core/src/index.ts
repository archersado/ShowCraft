export {
  confidenceSchema,
  entryPointCandidateSchema,
  evidenceEntrySchema,
  evidenceKindSchema,
  evidencePackSchema,
  evidenceReferenceSchema,
  featureIdSchema,
  featureSourceRefSchema,
  gateDecisionSchema,
  gateReasonSchema,
  gateResultSchema,
  narrationSourceSchema,
  releaseFeatureSchema,
  releaseBriefSchema,
  releasePackageSchema,
  renderFormatSchema,
  renderManifestSchema,
  reviewDecisionSchema,
  reviewStatusSchema,
  runFormatSchema,
  runRecordSchema,
  runStatusSchema,
  sceneIdSchema,
  scenePlanSchema,
  sceneSchema,
  DomainValidationError,
  formatIssues,
  validateReleasePackageRelations,
} from "./domain.js";

export type {
  EntryPointCandidate,
  EvidenceEntry,
  EvidencePack,
  EvidenceReference,
  FeatureSourceRef,
  GateDecision,
  GateReason,
  GateResult,
  ReleaseBrief,
  ReleaseFeature,
  ReleasePackage,
  RenderManifest,
  ReviewDecision,
  ReviewStatus,
  RunRecord,
  RunStatus,
  Scene,
  ScenePlan,
} from "./domain.js";

export {
  parseWithSchema,
  safeParseReleasePackage,
  stableJsonBytes,
  toStableJson,
} from "./serialization.js";

export type { ParseFailure, ParseResult, ParseSuccess } from "./serialization.js";

export {
  IllegalRunTransitionError,
  RunAlreadyExistsError,
  RunStoreCore,
  runStageOrder,
  stageFileNames,
} from "./runStore.js";

export type { RunStage, RunStoreEvent, RunStoreFile, StageArtifact, StageFailure } from "./runStore.js";

export {
  createMockCodeEvidence,
  createMockReleaseSource,
  createMockRenderer,
  createMockScenePlanner,
} from "./ports.js";

export type {
  CodeEvidencePort,
  ConfidenceGatePort,
  DesktopRunnerPort,
  DesktopStartInfo,
  EvidenceResult,
  ReleaseSourcePort,
  RendererPort,
  ScenePlanningContext,
  ScenePlannerPort,
} from "./ports.js";

export { DesktopRunnerError } from "./ports.js";
export type { DesktopRunnerErrorPhase } from "./ports.js";

export { runPipeline } from "./orchestrator.js";
export type { PipelinePorts } from "./orchestrator.js";

export { applyConfidenceGate, gateThreshold } from "./confidenceGate.js";

export {
  collectTokens,
  deriveEntryCandidates,
  matchCommitsToFeatures,
  parseScope,
} from "./evidenceMatching.js";

export type { CommitRecord, EvidenceWeights } from "./evidenceMatching.js";

export { normalizeSectionsToFeatures, slugifyTitle } from "./releaseMapping.js";

export {
  isSecretPath,
  parseReleaseDocument,
  parseReleaseSourceRef,
  ReleaseSourceError,
  validateLocalSource,
} from "./releaseSource.js";

export type {
  GitHubSourceRef,
  LocalSourceRef,
  ParsedReleaseDocument,
  ReleaseSection,
  ReleaseSourceRef,
} from "./releaseSource.js";
