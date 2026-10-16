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
  volumeSchema,
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
  Volume,
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
  FEATURE_DURATION_SECONDS,
  FEATURE_MAX_SECONDS,
  FEATURE_MIN_SECONDS,
  INTRO_FEATURE_ID,
  INTRO_OUTRO_DURATION_SECONDS,
  INTRO_OUTRO_MAX_SECONDS,
  INTRO_OUTRO_MIN_SECONDS,
  OUTRO_FEATURE_ID,
  VOLUME_LIMIT_SECONDS,
  DurationOrchestrationError,
  buildIntroOutroScenes,
  estimateTotalSeconds,
  planVolumes,
  plannedFeatureDurationSeconds,
} from "./durationOrchestration.js";

export type { PlannedVolume } from "./durationOrchestration.js";

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
