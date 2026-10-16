export {
  confidenceSchema,
  demoActionObservationsSchema,
  demoActionReasonSchema,
  demoActionRecordSchema,
  demoActionsSchema,
  demoActionStatusSchema,
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
  narrationArtifactSchema,
  narratedSceneSchema,
  subtitleCueSchema,
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
  DemoActionRecord,
  DemoActions,
  EvidenceEntry,
  EvidencePack,
  EvidenceReference,
  FeatureSourceRef,
  GateDecision,
  GateReason,
  GateResult,
  NarratedScene,
  NarrationArtifact,
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
  SubtitleCue,
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
  DesktopDemoPort,
  DesktopRunnerPort,
  DesktopStartInfo,
  NarrationPort,
  EvidenceResult,
  ReleaseSourcePort,
  RendererPort,
  ScenePlanningContext,
  ScenePlannerPort,
} from "./ports.js";

export { DesktopRunnerError } from "./ports.js";
export type { DesktopRunnerErrorPhase } from "./ports.js";
export { NarrationError } from "./ports.js";
export type { NarrationErrorPhase } from "./ports.js";

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
