import { z } from "zod";

/**
 * Domain contracts for ShowCraft. Two layers:
 * - entity schemas validate a single object's local fields and enums;
 * - aggregate schemas additionally verify cross-object `featureId` references.
 *
 * Design authority: openspec/changes/showcraft-release-video-mvp/design.md
 * (domain contract; technical run status stays independent of review status).
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const featureIdSchema = z
  .string()
  .min(1, "feature id must not be empty")
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, "feature id must be alphanumeric with . _ - separators");

export const sceneIdSchema = z
  .string()
  .min(1, "scene id must not be empty")
  .regex(/^[a-z0-9][a-z0-9._-]*$/i, "scene id must be alphanumeric with . _ - separators");

export const confidenceSchema = z
  .number()
  .min(0, "confidence must be >= 0")
  .max(1, "confidence must be <= 1");

/** The run is technically complete; whether it is deliverable is a review decision. */
export const runStatusSchema = z.enum(["pending", "running", "failed", "completed"]);

export const reviewStatusSchema = z.enum(["pending_review", "approved", "changes_requested"]);

export const evidenceKindSchema = z.enum(["commit", "diff", "file", "symbol", "entry_point"]);

export const narrationSourceSchema = z.enum(["narration", "human_supplement", "fallback"]);

// ---------------------------------------------------------------------------
// Release brief
// ---------------------------------------------------------------------------

/**
 * Feature-level provenance mapping back to one `##` section of the parsed
 * release document. Either fully present (features derived from a parsed
 * source) or absent (built-in mock / hand-written briefs) — never partial.
 */
export const featureSourceRefSchema = z
  .object({
    /** 1-based ordinal of the `##` section within the document. */
    sectionIndex: z.number().int().min(1, "sectionIndex must be >= 1"),
    /** Original section heading text, kept human-readable verbatim. */
    sectionTitle: z.string().min(1, "sectionTitle must not be empty"),
    /** Inclusive line range of the section in the source document. */
    startLine: z.number().int().min(1, "startLine must be >= 1"),
    endLine: z.number().int().min(1, "endLine must be >= 1"),
  })
  .strict()
  .refine((ref) => ref.endLine >= ref.startLine, {
    message: "endLine must be >= startLine",
    path: ["endLine"],
  });

export const releaseFeatureSchema = z
  .object({
    id: featureIdSchema,
    title: z.string().min(1, "feature title must not be empty"),
    narration: z.string().min(1, "feature narration must not be empty"),
    sourceRef: featureSourceRefSchema.optional(),
  })
  .strict();

export const releaseBriefSchema = z
  .object({
    version: z.string().min(1, "release version must not be empty"),
    source: z.string().min(1, "release source must not be empty"),
    /** Stable content digest of the raw release notes, for traceability. */
    sourceDigest: z.string().min(1).optional(),
    features: z.array(releaseFeatureSchema).min(1, "release must contain at least one feature"),
  })
  .strict();

export type FeatureSourceRef = z.infer<typeof featureSourceRefSchema>;
export type ReleaseFeature = z.infer<typeof releaseFeatureSchema>;
export type ReleaseBrief = z.infer<typeof releaseBriefSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

// ---------------------------------------------------------------------------
// Evidence pack
// ---------------------------------------------------------------------------

export const evidenceReferenceSchema = z
  .object({
    /** Commit hash, file path, symbol name or URL the evidence points at. */
    location: z.string().min(1, "evidence location must not be empty"),
    /** Optional short excerpt (code line, diff hunk, changelog sentence). */
    excerpt: z.string().optional(),
  })
  .strict();

export const evidenceEntrySchema = z
  .object({
    id: z.string().min(1, "evidence id must not be empty"),
    featureId: featureIdSchema,
    kind: evidenceKindSchema,
    reference: evidenceReferenceSchema,
    confidence: confidenceSchema,
  })
  .strict();

export const evidencePackSchema = z
  .object({
    releaseVersion: z.string().min(1, "evidence release version must not be empty"),
    entries: z.array(evidenceEntrySchema),
  })
  .strict();

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type EvidencePack = z.infer<typeof evidencePackSchema>;

/**
 * A product entry candidate derived from evidence. Low-confidence candidates
 * are downgraded to human supplement or narration by the caller (gate lives
 * outside the schema, per design).
 */
export const entryPointCandidateSchema = z
  .object({
    id: z.string().min(1, "entry point id must not be empty"),
    featureId: featureIdSchema,
    description: z.string().min(1, "entry point description must not be empty"),
    confidence: confidenceSchema,
    evidenceIds: z.array(z.string().min(1)).min(1, "entry point must cite at least one evidence"),
  })
  .strict();

export type EntryPointCandidate = z.infer<typeof entryPointCandidateSchema>;

// ---------------------------------------------------------------------------
// Scene plan
// ---------------------------------------------------------------------------

export const sceneSchema = z
  .object({
    id: sceneIdSchema,
    featureId: featureIdSchema,
    title: z.string().min(1, "scene title must not be empty"),
    narration: z.string().min(1, "scene narration must not be empty"),
    /** Where the narration text came from; human supplements stay auditable. */
    narrationSource: narrationSourceSchema,
    /** Planned duration in seconds; duration orchestration lives in later stories. */
    plannedDurationSeconds: z.number().positive("scene duration must be positive"),
  })
  .strict();

export const scenePlanSchema = z
  .object({
    releaseVersion: z.string().min(1, "scene plan release version must not be empty"),
    scenes: z.array(sceneSchema),
  })
  .strict();

export type Scene = z.infer<typeof sceneSchema>;
export type ScenePlan = z.infer<typeof scenePlanSchema>;

// ---------------------------------------------------------------------------
// Render manifest
// ---------------------------------------------------------------------------

export const renderFormatSchema = z.enum(["showcraft.mock-manifest/v1"]);

export const renderManifestSchema = z
  .object({
    format: renderFormatSchema,
    releaseVersion: z.string().min(1, "manifest release version must not be empty"),
    scenes: z.array(sceneSchema),
  })
  .strict();

export type RenderManifest = z.infer<typeof renderManifestSchema>;

// ---------------------------------------------------------------------------
// Run record and review decision (independent statuses by design)
// ---------------------------------------------------------------------------

export const runFormatSchema = z.enum(["showcraft.mock-run/v1"]);

export const runRecordSchema = z
  .object({
    format: runFormatSchema,
    runId: z.string().min(1, "run id must not be empty"),
    status: runStatusSchema,
    artifacts: z.array(z.string().min(1, "artifact name must not be empty")),
    failure: z
      .object({
        stage: z.string().min(1, "failure stage must not be empty"),
        reason: z.string().min(1, "failure reason must not be empty"),
      })
      .strict()
      .optional(),
  })
  .strict();

export const reviewDecisionSchema = z
  .object({
    runId: z.string().min(1, "review run id must not be empty"),
    status: reviewStatusSchema,
    reviewer: z.string().min(1, "reviewer must not be empty").optional(),
    comment: z.string().optional(),
  })
  .strict();

export type RunRecord = z.infer<typeof runRecordSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

// ---------------------------------------------------------------------------
// Cross-object aggregation
// ---------------------------------------------------------------------------

export const releasePackageSchema = z
  .object({
    release: releaseBriefSchema,
    evidence: evidencePackSchema.optional(),
    entryPoints: z.array(entryPointCandidateSchema).optional(),
    scenePlan: scenePlanSchema.optional(),
    manifest: renderManifestSchema.optional(),
    run: runRecordSchema.optional(),
    review: reviewDecisionSchema.optional(),
  })
  .strict();

export type ReleasePackage = z.infer<typeof releasePackageSchema>;

export class DomainValidationError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(
      issues.length === 1
        ? `Domain validation failed at ${issues[0]?.path ?? "?"}: ${issues[0]?.message ?? ""}`
        : `Domain validation failed with ${issues.length} issues: ${issues
            .map((issue) => `${issue.path}: ${issue.message}`)
            .join("; ")}`,
    );
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}

export function formatIssues(issues: readonly z.ZodIssue[]): Array<{ path: string; message: string }> {
  return issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map((segment) => String(segment)).join(".") : "(root)",
    message: issue.message,
  }));
}

function collectFeatureIds(release: ReleaseBrief): Set<string> {
  return new Set(release.features.map((feature) => feature.id));
}

function assertUniqueFeatureIds(release: ReleaseBrief): void {
  const seen = new Set<string>();
  for (const feature of release.features) {
    if (seen.has(feature.id)) {
      throw new DomainValidationError([
        {
          path: `release.features[id=${feature.id}]`,
          message: "duplicate feature id",
        },
      ]);
    }
    seen.add(feature.id);
  }
}

function assertReferences(release: ReleaseBrief, featureId: string, path: string): void {
  if (!collectFeatureIds(release).has(featureId)) {
    throw new DomainValidationError([
      {
        path,
        message: `references unknown featureId "${featureId}"`,
      },
    ]);
  }
}

/**
 * Validate cross-object feature references on an already field-parsed
 * package. Call this after parsing; safeParseReleasePackage runs it for you.
 */
export function validateReleasePackageRelations(packageValue: ReleasePackage): void {
  const { release } = packageValue;
  assertUniqueFeatureIds(release);

  for (const entry of packageValue.evidence?.entries ?? []) {
    assertReferences(release, entry.featureId, `evidence.entries[id=${entry.id}].featureId`);
  }
  for (const candidate of packageValue.entryPoints ?? []) {
    assertReferences(release, candidate.featureId, `entryPoints[id=${candidate.id}].featureId`);
  }
  for (const scene of packageValue.scenePlan?.scenes ?? []) {
    assertReferences(release, scene.featureId, `scenePlan.scenes[id=${scene.id}].featureId`);
  }
  for (const scene of packageValue.manifest?.scenes ?? []) {
    assertReferences(release, scene.featureId, `manifest.scenes[id=${scene.id}].featureId`);
  }

  const version = release.version;
  if (packageValue.evidence && packageValue.evidence.releaseVersion !== version) {
    throw new DomainValidationError([
      {
        path: "evidence.releaseVersion",
        message: `does not match release version "${version}"`,
      },
    ]);
  }
  if (packageValue.scenePlan && packageValue.scenePlan.releaseVersion !== version) {
    throw new DomainValidationError([
      {
        path: "scenePlan.releaseVersion",
        message: `does not match release version "${version}"`,
      },
    ]);
  }
  if (packageValue.manifest && packageValue.manifest.releaseVersion !== version) {
    throw new DomainValidationError([
      {
        path: "manifest.releaseVersion",
        message: `does not match release version "${version}"`,
      },
    ]);
  }
}
