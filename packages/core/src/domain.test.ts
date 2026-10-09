import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  entryPointCandidateSchema,
  evidencePackSchema,
  gateResultSchema,
  releaseBriefSchema,
  renderManifestSchema,
  reviewDecisionSchema,
  runRecordSchema,
  scenePlanSchema,
  validateReleasePackageRelations,
} from "./domain.js";
import { sampleRelease, sampleScene } from "./testing.js";

const release = sampleRelease;

const scene = sampleScene;

describe("releaseBriefSchema", () => {
  it("accepts a release with at least one feature", () => {
    const result = releaseBriefSchema.safeParse(release);
    expect(result.success).toBe(true);
  });

  it("rejects a release missing its version with a field path", () => {
    const result = releaseBriefSchema.safeParse({ ...release, version: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "version")).toBe(true);
    }
  });

  it("rejects an empty feature array", () => {
    const result = releaseBriefSchema.safeParse({ ...release, features: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "features")).toBe(true);
    }
  });

  it("rejects duplicate feature ids in relation validation", () => {
    const duplicated = {
      ...release,
      features: [release.features[0], release.features[0]],
    };
    expect(() => validateReleasePackageRelations({ release: duplicated })).toThrow(
      DomainValidationError,
    );
  });

  it("accepts a feature carrying a valid sourceRef", () => {
    const result = releaseBriefSchema.safeParse({
      ...release,
      features: [
        {
          id: "section-1-im",
          title: "感知与 IM 路由",
          narration: "感知与 IM 路由讲解",
          sourceRef: { sectionIndex: 1, sectionTitle: "感知与 IM 路由", startLine: 5, endLine: 11 },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features[0]?.sourceRef).toEqual({
        sectionIndex: 1,
        sectionTitle: "感知与 IM 路由",
        startLine: 5,
        endLine: 11,
      });
    }
  });

  it("still accepts features without sourceRef (mock / hand-written briefs)", () => {
    const result = releaseBriefSchema.safeParse(release);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features.every((feature) => feature.sourceRef === undefined)).toBe(true);
    }
  });

  it("rejects unknown keys on a feature (strict schema)", () => {
    const result = releaseBriefSchema.safeParse({
      ...release,
      features: [{ ...release.features[0], provenance: "unknown" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "features.0")).toBe(true);
    }
  });

  it("rejects a sourceRef whose endLine precedes its startLine", () => {
    const result = releaseBriefSchema.safeParse({
      ...release,
      features: [
        {
          id: "section-1-im",
          title: "感知与 IM 路由",
          narration: "感知与 IM 路由讲解",
          sourceRef: { sectionIndex: 1, sectionTitle: "感知与 IM 路由", startLine: 11, endLine: 5 },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "features.0.sourceRef.endLine"),
      ).toBe(true);
    }
  });

  it("rejects a sourceRef with a non-positive line number", () => {
    const result = releaseBriefSchema.safeParse({
      ...release,
      features: [
        {
          id: "section-1-im",
          title: "感知与 IM 路由",
          narration: "感知与 IM 路由讲解",
          sourceRef: { sectionIndex: 1, sectionTitle: "感知与 IM 路由", startLine: 0, endLine: 5 },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "features.0.sourceRef.startLine"),
      ).toBe(true);
    }
  });
});

describe("evidencePackSchema", () => {
  it("rejects confidence outside 0-1 with the offending path", () => {
    const pack = {
      releaseVersion: release.version,
      entries: [
        {
          id: "ev-1",
          featureId: "perception-routing",
          kind: "commit",
          reference: { location: "abc123" },
          confidence: 1.5,
        },
      ],
    };
    const result = evidencePackSchema.safeParse(pack);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "entries.0.confidence",
      );
    }
  });

  it("rejects an unknown evidence kind", () => {
    const pack = {
      releaseVersion: release.version,
      entries: [
        {
          id: "ev-1",
          featureId: "perception-routing",
          kind: "vibes",
          reference: { location: "abc123" },
          confidence: 0.5,
        },
      ],
    };
    expect(evidencePackSchema.safeParse(pack).success).toBe(false);
  });
});

describe("entryPointCandidateSchema", () => {
  it("requires at least one cited evidence id", () => {
    const candidate = {
      id: "entry-1",
      featureId: "perception-routing",
      description: "感知设置页",
      confidence: 0.9,
      evidenceIds: [],
    };
    expect(entryPointCandidateSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("scenePlanSchema", () => {
  it("rejects non-positive scene duration", () => {
    const plan = {
      releaseVersion: release.version,
      scenes: [{ ...scene("perception-routing", "scene-1"), plannedDurationSeconds: 0 }],
    };
    expect(scenePlanSchema.safeParse(plan).success).toBe(false);
  });
});

describe("renderManifestSchema", () => {
  it("rejects an unknown manifest format", () => {
    const manifest = {
      format: "showcraft.real-manifest/v9",
      releaseVersion: release.version,
      scenes: [scene("perception-routing", "scene-1")],
    };
    expect(renderManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("runRecordSchema and reviewDecisionSchema", () => {
  it("rejects unknown run status", () => {
    const run = {
      format: "showcraft.mock-run/v1",
      runId: "run-1",
      status: "shipped",
      artifacts: ["release.json"],
    };
    expect(runRecordSchema.safeParse(run).success).toBe(false);
  });

  it("rejects unknown review status", () => {
    const review = { runId: "run-1", status: "auto_approved" };
    expect(reviewDecisionSchema.safeParse(review).success).toBe(false);
  });

  it("keeps technical completion and pending review independent", () => {
    const run = runRecordSchema.parse({
      format: "showcraft.mock-run/v1",
      runId: "run-1",
      status: "completed",
      artifacts: ["release.json", "manifest.json"],
    });
    const review = reviewDecisionSchema.parse({ runId: "run-1", status: "pending_review" });
    expect(run.status).toBe("completed");
    expect(review.status).toBe("pending_review");
  });
});

describe("releasePackageSchema relations", () => {
  const basePackage = {
    release,
    scenePlan: {
      releaseVersion: release.version,
      scenes: [scene("perception-routing", "scene-1"), scene("im-routing", "scene-2")],
    },
    manifest: {
      format: "showcraft.mock-manifest/v1",
      releaseVersion: release.version,
      scenes: [scene("perception-routing", "scene-1")],
    },
  };

  it("accepts a package whose references all resolve", () => {
    expect(() => validateReleasePackageRelations(basePackage)).not.toThrow();
  });

  it("rejects a scene referencing an unknown feature", () => {
    const broken = {
      ...basePackage,
      scenePlan: {
        releaseVersion: release.version,
        scenes: [scene("ghost-feature", "scene-x")],
      },
    };
    expect(() => validateReleasePackageRelations(broken)).toThrow(
      /unknown featureId "ghost-feature"/,
    );
  });

  it("rejects a manifest whose release version mismatches the brief", () => {
    const mismatched = {
      ...basePackage,
      manifest: { ...basePackage.manifest, releaseVersion: "v9.9.9" },
    };
    expect(() => validateReleasePackageRelations(mismatched)).toThrow(
      /does not match release version/,
    );
  });

});

describe("gateResultSchema and gate ↔ scenePlan relations", () => {
  const scene = (featureId: string, id: string, narrationSource: "narration" | "fallback" | "human_supplement" = "narration") => ({
    ...sampleScene(featureId, id),
    narrationSource,
  });

  const gateFor = (
    releaseVersion: string,
    decisions: Array<{ featureId: string; reason: "no_evidence" | "below_threshold" | "eligible"; automatable: boolean; confidence?: number; evidenceIds: string[] }>,
  ) => ({ releaseVersion, threshold: 0.8, decisions });

  const scenePlanFor = (scenes: ReturnType<typeof scene>[]) => ({
    releaseVersion: release.version,
    scenes,
  });

  it("accepts a gate result whose decisions match the scene plan narration sources", () => {
    const pkg = {
      release,
      gate: gateFor(release.version, [
        { featureId: "perception-routing", reason: "eligible", automatable: true, confidence: 0.9, evidenceIds: ["ev-1"] },
        { featureId: "im-routing", reason: "no_evidence", automatable: false, evidenceIds: [] },
      ]),
      scenePlan: scenePlanFor([
        scene("perception-routing", "scene-1", "narration"),
        scene("im-routing", "scene-2", "fallback"),
      ]),
    };
    expect(gateResultSchema.safeParse(pkg.gate).success).toBe(true);
    expect(() => validateReleasePackageRelations(pkg)).not.toThrow();
  });

  it("rejects a gated feature whose scene still claims narration source", () => {
    const pkg = {
      release,
      gate: gateFor(release.version, [
        { featureId: "perception-routing", reason: "no_evidence", automatable: false, evidenceIds: [] },
      ]),
      scenePlan: scenePlanFor([scene("perception-routing", "scene-1", "narration")]),
    };
    try {
      validateReleasePackageRelations(pkg);
      expect.unreachable("expected DomainValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      expect((error as DomainValidationError).issues[0]?.path).toBe(
        "scenePlan.scenes[id=scene-1].narrationSource",
      );
      expect((error as Error).message).toContain("perception-routing");
      expect((error as Error).message).toContain("fallback");
    }
  });

  it("rejects an eligible feature whose scene was downgraded to fallback", () => {
    const pkg = {
      release,
      gate: gateFor(release.version, [
        { featureId: "perception-routing", reason: "eligible", automatable: true, confidence: 0.9, evidenceIds: ["ev-1"] },
      ]),
      scenePlan: scenePlanFor([scene("perception-routing", "scene-1", "fallback")]),
    };
    expect(() => validateReleasePackageRelations(pkg)).toThrow(
      /narrationSource must be "narration", got "fallback"/,
    );
  });

  it("rejects a gate decision referencing an unknown feature", () => {
    const pkg = {
      release,
      gate: gateFor(release.version, [
        { featureId: "ghost-feature", reason: "no_evidence", automatable: false, evidenceIds: [] },
      ]),
    };
    expect(() => validateReleasePackageRelations(pkg)).toThrow(
      /unknown featureId "ghost-feature"/,
    );
  });

  it("rejects a gate decision with no matching scene in the plan", () => {
    const pkg = {
      release,
      gate: gateFor(release.version, [
        { featureId: "im-routing", reason: "no_evidence", automatable: false, evidenceIds: [] },
      ]),
      scenePlan: scenePlanFor([scene("perception-routing", "scene-1", "fallback")]),
    };
    expect(() => validateReleasePackageRelations(pkg)).toThrow(
      /has no scene in the scene plan/,
    );
  });

  it("rejects a gate release version mismatch", () => {
    const pkg = {
      release,
      gate: gateFor("v9.9.9", [
        { featureId: "perception-routing", reason: "no_evidence", automatable: false, evidenceIds: [] },
      ]),
    };
    expect(() => validateReleasePackageRelations(pkg)).toThrow(
      /does not match release version/,
    );
  });

  it("rejects an eligible decision that cites no evidence", () => {
    const result = gateResultSchema.safeParse(
      gateFor(release.version, [
        { featureId: "perception-routing", reason: "eligible", automatable: true, confidence: 0.9, evidenceIds: [] },
      ]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join(".").endsWith(".evidenceIds")),
      ).toBe(true);
    }
  });

  it("rejects a no_evidence decision that carries evidence references or a confidence", () => {
    const withEvidence = gateResultSchema.safeParse(
      gateFor(release.version, [
        { featureId: "perception-routing", reason: "no_evidence", automatable: false, evidenceIds: ["ev-1"] },
      ]),
    );
    expect(withEvidence.success).toBe(false);

    const withConfidence = gateResultSchema.safeParse(
      gateFor(release.version, [
        { featureId: "perception-routing", reason: "no_evidence", automatable: false, confidence: 0.5, evidenceIds: [] },
      ]),
    );
    expect(withConfidence.success).toBe(false);
  });

  it("rejects a below_threshold decision carrying no confidence", () => {
    const result = gateResultSchema.safeParse(
      gateFor(release.version, [
        { featureId: "perception-routing", reason: "below_threshold", automatable: false, evidenceIds: ["ev-1"] },
      ]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.join(".").endsWith(".confidence")),
      ).toBe(true);
    }
  });
});
