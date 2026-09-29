import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  entryPointCandidateSchema,
  evidencePackSchema,
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
