import { describe, expect, it } from "vitest";

import { releasePackageSchema } from "./domain.js";
import { safeParseReleasePackage, stableJsonBytes, toStableJson } from "./serialization.js";

const demoPackage = {
  release: {
    source: "mock://showcraft/demo-release",
    version: "v0.3.3",
    features: [
      { id: "perception-routing", narration: "感知路由讲解", title: "感知路由" },
      { id: "im-routing", narration: "IM 路由讲解", title: "IM 路由" },
    ],
  },
  manifest: {
    format: "showcraft.mock-manifest/v1",
    releaseVersion: "v0.3.3",
    scenes: [
      {
        id: "scene-perception-routing",
        featureId: "perception-routing",
        title: "感知路由",
        narration: "感知路由讲解",
        narrationSource: "narration",
        plannedDurationSeconds: 15,
      },
      {
        id: "scene-im-routing",
        featureId: "im-routing",
        title: "IM 路由",
        narration: "IM 路由讲解",
        narrationSource: "narration",
        plannedDurationSeconds: 15,
      },
    ],
  },
  run: {
    format: "showcraft.mock-run/v1",
    runId: "run-1",
    status: "completed",
    artifacts: ["release.json", "manifest.json"],
  },
  review: {
    runId: "run-1",
    status: "pending_review",
    comment: "等待运营确认事实",
  },
};

describe("toStableJson", () => {
  it("produces identical bytes regardless of key insertion order", () => {
    const a = { b: 1, a: { d: 2, c: [3, { z: 4, y: 5 }] } };
    const b = { a: { c: [3, { y: 5, z: 4 }], d: 2 }, b: 1 };
    expect(toStableJson(a)).toBe(toStableJson(b));
  });

  it("preserves array order across sorting", () => {
    const value = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    const parsed = JSON.parse(toStableJson(value));
    expect(parsed.items.map((item: { a?: number; c?: number }) => item.a ?? item.c)).toEqual([1, 3]);
  });

  it("stableJsonBytes appends a trailing newline", () => {
    const bytes = stableJsonBytes({ a: 1 });
    expect(new TextDecoder().decode(bytes)).toBe('{\n  "a": 1\n}\n');
  });
});

describe("safeParseReleasePackage", () => {
  it("round-trips a legal package to an equivalent object", () => {
    const result = safeParseReleasePackage(releasePackageSchema, demoPackage);
    expect(result.success).toBe(true);
    if (result.success) {
      const reparsed = safeParseReleasePackage(
        releasePackageSchema,
        JSON.parse(toStableJson(result.value)),
      );
      expect(reparsed.success).toBe(true);
      if (reparsed.success) {
        expect(reparsed.value).toEqual(result.value);
      }
    }
  });

  it("yields identical JSON bytes after a round trip", () => {
    const first = safeParseReleasePackage(releasePackageSchema, demoPackage);
    expect(first.success).toBe(true);
    if (!first.success) return;
    const json = toStableJson(first.value);
    const second = safeParseReleasePackage(releasePackageSchema, JSON.parse(json));
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(toStableJson(second.value)).toBe(json);
  });

  it("preserves completed run and pending review statuses independently", () => {
    const result = safeParseReleasePackage(releasePackageSchema, demoPackage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.run?.status).toBe("completed");
      expect(result.value.review?.status).toBe("pending_review");
    }
  });

  it("reports field paths for missing required fields", () => {
    const withoutRelease: Record<string, unknown> = { ...demoPackage };
    delete withoutRelease.release;
    const result = safeParseReleasePackage(releasePackageSchema, withoutRelease);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.path === "release")).toBe(true);
    }
  });

  it("rejects a scene referencing an unknown feature with a readable path", () => {
    const broken = JSON.parse(JSON.stringify(demoPackage));
    broken.manifest.scenes[0].featureId = "ghost-feature";
    const result = safeParseReleasePackage(releasePackageSchema, broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(
          (issue) =>
            issue.path.startsWith("manifest.scenes") && issue.message.includes("ghost-feature"),
        ),
      ).toBe(true);
    }
  });
});
