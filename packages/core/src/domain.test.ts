import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  demoActionRecordSchema,
  demoActionsSchema,
  entryPointCandidateSchema,
  evidencePackSchema,
  gateResultSchema,
  narrationArtifactSchema,
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

describe("narrationArtifactSchema", () => {
  const artifact = {
    releaseVersion: "v1",
    voice: "zh-CN-XiaoxiaoNeural",
    scenes: [{
      sceneId: "scene-one",
      featureId: "feature-one",
      audioFile: "narration-scene-one.mp3",
      audioDurationMs: 1_000,
      voice: "zh-CN-XiaoxiaoNeural",
      cues: [{ text: "中文", startMs: 100, endMs: 300 }],
    }],
  };

  it("accepts valid word-level timing", () => {
    expect(narrationArtifactSchema.safeParse(artifact).success).toBe(true);
  });

  it("rejects non-positive cue spans", () => {
    const invalid = structuredClone(artifact);
    invalid.scenes[0]!.cues[0]!.endMs = 100;
    expect(narrationArtifactSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects cues whose starts move backwards", () => {
    const invalid = structuredClone(artifact);
    invalid.scenes[0]!.cues.push({ text: "倒序", startMs: 50, endMs: 80 });
    expect(narrationArtifactSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects path-like audio file references", () => {
    const invalid = structuredClone(artifact);
    invalid.scenes[0]!.audioFile = "../audio.mp3";
    expect(narrationArtifactSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects timing beyond the audio duration, duplicate files, and conflicting voices", () => {
    const invalid = structuredClone(artifact);
    invalid.scenes[0]!.cues[0]!.endMs = 2_000;
    invalid.scenes.push({
      ...structuredClone(invalid.scenes[0]!),
      sceneId: "scene-two",
      voice: "en-US-EmmaMultilingualNeural",
    });
    const result = narrationArtifactSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["scenes.0.cues", "scenes.1.audioFile", "scenes.1.voice"]),
      );
    }
  });

  it("validates narration against release and scene-plan relations", () => {
    const scenePlan = {
      releaseVersion: release.version,
      scenes: [sampleScene(release.features[0]!.id, "scene-one")],
    };
    const narration = {
      ...artifact,
      releaseVersion: release.version,
      scenes: [{ ...artifact.scenes[0]!, featureId: release.features[0]!.id }],
    };
    expect(() => validateReleasePackageRelations({ release, scenePlan, narration })).not.toThrow();
    expect(() => validateReleasePackageRelations({
      release,
      scenePlan,
      narration: { ...narration, releaseVersion: "wrong" },
    })).toThrow(/narration.releaseVersion/);
    expect(() => validateReleasePackageRelations({
      release,
      scenePlan,
      narration: { ...narration, scenes: [] },
    })).toThrow(/exactly one/);
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

describe("desktop action schemas", () => {
  const sourceRef = {
    sectionIndex: 1,
    sectionTitle: "感知与 IM 路由",
    startLine: 5,
    endLine: 11,
  };

  it("accepts an executed action with gate evidence and stable observations", () => {
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-1-im",
        status: "executed",
        reason: "eligible",
        sourceRef,
        evidenceIds: ["ev-1"],
        observations: {
          window_route_status: 200,
          management_api_status: 200,
          ask_user_candidate_present: true,
        },
      }).success,
    ).toBe(true);
  });

  it("accepts media for executed actions and failed action evidence", () => {
    const base = {
      featureId: "section-1-im",
      sourceRef,
      evidenceIds: ["ev-1"],
      observations: { window_route_status: 200 },
      media: { file: "recording-section-1-im.mov" },
    };
    expect(
      demoActionRecordSchema.safeParse({ ...base, status: "executed", reason: "eligible" }).success,
    ).toBe(true);
    expect(
      demoActionRecordSchema.safeParse({
        ...base,
        status: "failed",
        reason: "action_failed",
      }).success,
    ).toBe(true);
  });

  it("rejects media on recording failures and skipped actions", () => {
    const base = {
      featureId: "section-1-im",
      sourceRef,
      evidenceIds: ["ev-1"],
      media: { file: "recording-section-1-im.mov" },
    };
    expect(
      demoActionRecordSchema.safeParse({
        ...base,
        status: "failed",
        reason: "recording_failed",
      }).success,
    ).toBe(false);
    expect(
      demoActionRecordSchema.safeParse({
        ...base,
        status: "skipped",
        reason: "unsupported_feature",
      }).success,
    ).toBe(false);
  });

  it("rejects media file paths and accepts recording failures without media", () => {
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-1-im",
        status: "failed",
        reason: "recording_failed",
        sourceRef,
        evidenceIds: ["ev-1"],
        diagnostics: "screen recording permission denied",
      }).success,
    ).toBe(true);
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-1-im",
        status: "executed",
        reason: "eligible",
        sourceRef,
        evidenceIds: ["ev-1"],
        observations: { window_route_status: 200 },
        media: { file: "../recording.mov" },
      }).success,
    ).toBe(false);
  });

  it.each([".", ".."])('rejects the directory component media file "%s"', (file) => {
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-1-im",
        status: "executed",
        reason: "eligible",
        sourceRef,
        evidenceIds: ["ev-1"],
        observations: { window_route_status: 200 },
        media: { file },
      }).success,
    ).toBe(false);
  });

  it("rejects executed records without eligible evidence", () => {
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-1-im",
        status: "executed",
        reason: "action_failed",
        sourceRef,
        evidenceIds: [],
      }).success,
    ).toBe(false);
  });

  it("requires no_evidence records to be skipped with an empty evidence list", () => {
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-2-section",
        status: "skipped",
        reason: "no_evidence",
        sourceRef,
        evidenceIds: ["ev-1"],
      }).success,
    ).toBe(false);
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-2-section",
        status: "skipped",
        reason: "no_evidence",
        sourceRef,
        evidenceIds: [],
      }).success,
    ).toBe(true);
  });

  it("rejects skipped and failed records with incompatible reasons", () => {
    expect(demoActionRecordSchema.safeParse({
      featureId: "section-1-im",
      status: "skipped",
      reason: "action_failed",
      sourceRef,
      evidenceIds: ["ev-1"],
    }).success).toBe(false);
    expect(demoActionRecordSchema.safeParse({
      featureId: "section-1-im",
      status: "failed",
      reason: "unsupported_feature",
      sourceRef,
      evidenceIds: ["ev-1"],
    }).success).toBe(false);
  });

  it("bounds diagnostics and observation value types", () => {
    expect(
      demoActionRecordSchema.safeParse({
        featureId: "section-1-im",
        status: "failed",
        reason: "action_failed",
        sourceRef,
        evidenceIds: ["ev-1"],
        observations: { unstable: { nested: true } },
        diagnostics: "x".repeat(2049),
      }).success,
    ).toBe(false);
  });

  it("validates the actions aggregate", () => {
    expect(
      demoActionsSchema.safeParse({ releaseVersion: "v0.3.3", threshold: 0.8, actions: [] })
        .success,
    ).toBe(true);
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

describe("actions cross-artifact relations", () => {
  const sourcedRelease = {
    ...release,
    features: release.features.map((feature, index) => ({
      ...feature,
      sourceRef: {
        sectionIndex: index + 1,
        sectionTitle: feature.title,
        startLine: index * 5 + 1,
        endLine: index * 5 + 5,
      },
    })),
  };
  const evidence = {
    releaseVersion: release.version,
    entries: [{
      id: "ev-1",
      featureId: "perception-routing",
      kind: "commit" as const,
      reference: { location: "a".repeat(40) },
      confidence: 0.9,
    }],
  };
  const gate = {
    releaseVersion: release.version,
    threshold: 0.8,
    decisions: [{
      featureId: "perception-routing",
      reason: "eligible" as const,
      automatable: true,
      confidence: 0.9,
      evidenceIds: ["ev-1"],
    }],
  };
  const actions = {
    releaseVersion: release.version,
    threshold: 0.8,
    actions: [{
      featureId: "perception-routing",
      status: "executed" as const,
      reason: "eligible" as const,
      sourceRef: sourcedRelease.features[0]!.sourceRef,
      evidenceIds: ["ev-1"],
      observations: { window_route_status: 200 },
    }],
  };

  it("accepts exact release, gate, and evidence backlinks", () => {
    expect(() => validateReleasePackageRelations({ release: sourcedRelease, evidence, gate, actions })).not.toThrow();
  });

  it("rejects sourceRef drift and unknown executed evidence", () => {
    expect(() => validateReleasePackageRelations({
      release: sourcedRelease,
      evidence,
      gate,
      actions: {
        ...actions,
        actions: [{ ...actions.actions[0]!, sourceRef: { ...actions.actions[0]!.sourceRef, startLine: 99 } }],
      },
    })).toThrow(/sourceRef/);

    expect(() => validateReleasePackageRelations({
      release: sourcedRelease,
      evidence: { ...evidence, entries: [] },
      gate,
      actions,
    })).toThrow(/unknown evidence id/);
  });

  it("rejects evidenceIds that differ from the gate decision", () => {
    expect(() => validateReleasePackageRelations({
      release: sourcedRelease,
      evidence,
      gate,
      actions: { ...actions, actions: [{ ...actions.actions[0]!, evidenceIds: ["ev-other"] }] },
    })).toThrow(/gate decision evidenceIds/);
  });

  it("requires exactly one action for every gate decision", () => {
    expect(() => validateReleasePackageRelations({
      release: sourcedRelease,
      evidence,
      gate,
      actions: { ...actions, actions: [] },
    })).toThrow(/exactly one/);
    expect(() => validateReleasePackageRelations({
      release: sourcedRelease,
      evidence,
      gate,
      actions: { ...actions, actions: [actions.actions[0]!, actions.actions[0]!] },
    })).toThrow(/exactly one/);
  });
});
