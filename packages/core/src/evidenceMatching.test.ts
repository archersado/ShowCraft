import { describe, expect, it } from "vitest";

import {
  collectTokens,
  deriveEntryCandidates,
  matchCommitsToFeatures,
  parseScope,
  type CommitRecord,
} from "./evidenceMatching.js";
import { evidencePackSchema, entryPointCandidateSchema, type ReleaseBrief } from "./index.js";

const commit = (
  hash: string,
  subject: string,
  pathSegments: string[] = [],
): CommitRecord => ({
  hash,
  subject,
  scope: parseScope(subject),
  pathSegments,
  isMerge: pathSegments.length === 0,
});

const release: ReleaseBrief = {
  version: "v0.3.3",
  source: "mock://showcraft/demo-release",
  features: [
    {
      id: "section-1-im",
      title: "感知与 IM 路由",
      narration: "有界 sticky 路由；修复 Jev 失败缺少 IM 兜底的问题。",
    },
    { id: "section-2-section", title: "企业微信办公能力", narration: "企业微信日程等办公能力。" },
  ],
};

const rangeCommits: CommitRecord[] = [
  commit("edf15733fc721ad70a121b01615c7cda0f3d7f6b", "fix(perception): prompt IM users for ambiguous targets", [
    "packages",
    "core",
    "src",
    "modules",
    "perception-runtime",
    "decision",
    "policy.ts",
  ]),
  commit(
    "aadff7f704992fc517bab157e7979b3c40493533",
    "release: prepare v0.3.3",
    [],
  ),
  commit("d5df3d5000000000000000000000000000000001", "fix(settings): save Jev config from dialog save"),
  commit("aaaaaaaa0000000000000000000000000000000002", "feat(ontology): add cross-package read service", [
    "packages",
    "core",
    "src",
    "lib",
    "features",
    "project",
  ]),
];

describe("collectTokens", () => {
  it("lowercases Latin tokens of ≥2 characters and skips CJK and single chars", () => {
    expect(collectTokens("感知与 IM 路由")).toEqual(["im"]);
    expect(collectTokens("sticky 路由和 Jev 兜底")).toEqual(["sticky", "jev"]);
    expect(collectTokens("a A b I am")).toEqual(["am"]);
    expect(collectTokens("纯中文标题")).toEqual([]);
    expect(collectTokens("")).toEqual([]);
  });

  it("keeps digits and mixed alphanumeric tokens, dedupes case-insensitively", () => {
    expect(collectTokens("v0.3.3 and V0.3.3")).toEqual(["v0", "and"]);
  });

  it("dedupes repeated tokens keeping first occurrence", () => {
    expect(collectTokens("route Routing ROUTE")).toEqual(["route", "routing"]);
  });
});

describe("parseScope", () => {
  it("extracts lowercased conventional-commit scopes", () => {
    expect(parseScope("fix(perception): prompt IM users")).toBe("perception");
    expect(parseScope("feat(Ontology)!: add service")).toBe("ontology");
    expect(parseScope("release: prepare v0.3.3")).toBe("");
    expect(parseScope("merge: complete ONT7-T2")).toBe("");
  });
});

describe("matchCommitsToFeatures", () => {
  it("hits section-1-im via title token `im` in subject and narration tokens in paths", () => {
    const result = matchCommitsToFeatures(release, rangeCommits);

    const imEntries = result.pack.entries.filter((entry) => entry.featureId === "section-1-im");
    // edf1573: subject word boundary hit `IM`; aadff7f: no file list (merge)
    // but subject words match nothing for this feature — the d5df3d5 commit
    // subject hits `jev` from the narration bullets.
    expect(imEntries.length).toBeGreaterThanOrEqual(1);
    const edfEntry = imEntries.find((entry) => entry.reference.location.startsWith("edf1573"));
    expect(edfEntry).toBeDefined();
    expect(edfEntry?.kind).toBe("commit");
    expect(edfEntry?.confidence).toBeGreaterThanOrEqual(0.4);
    expect(edfEntry?.confidence).toBeLessThanOrEqual(1);
  });

  it("yields at least one entry candidate for section-1-im with resolvable evidenceIds", () => {
    const result = matchCommitsToFeatures(release, rangeCommits);

    const candidates = result.entryPoints.filter((candidate) => candidate.featureId === "section-1-im");
    expect(candidates.length).toBe(1);
    const candidate = entryPointCandidateSchema.parse(candidates[0]);
    expect(candidate.id).toBe("entry-section-1-im");
    expect(candidate.evidenceIds.length).toBeGreaterThanOrEqual(1);
    for (const evidenceId of candidate.evidenceIds) {
      expect(result.pack.entries.some((entry) => entry.id === evidenceId)).toBe(true);
    }
  });

  it("weights title-token subject hits (0.4) above narration-token hits (0.25)", () => {
    // The feature's narration also contains `im` (a second token hit), so
    // isolate the weights with a narration that only carries `jev`.
    const jevOnlyRelease: ReleaseBrief = {
      version: "v0.3.3",
      source: "mock://showcraft/demo-release",
      features: [
        { id: "f-jev", title: "感知路由", narration: "修复 Jev 失败的问题" },
        { id: "f-im", title: "IM 路由", narration: "路由讲解" },
      ],
    };
    const result = matchCommitsToFeatures(jevOnlyRelease, [
      commit("cccc00000000000000000000000000000000000004", "chore: jev cleanup"),
      commit("bbbb00000000000000000000000000000000000003", "fix(core): im fallback"),
    ]);
    const byFeature = new Map(result.pack.entries.map((entry) => [entry.featureId, entry]));
    // Narration token `jev` hitting a subject: 0.25.
    expect(byFeature.get("f-jev")?.confidence).toBe(0.25);
    // Title token `im` hitting a subject: 0.4.
    expect(byFeature.get("f-im")?.confidence).toBe(0.4);
    // Candidate takes the max cited confidence per feature.
    const imCandidate = result.entryPoints.find((c) => c.featureId === "f-im");
    expect(imCandidate?.confidence).toBe(0.4);
  });

  it("keeps all hits as entries but one candidate per feature (max confidence)", () => {
    const singleCommitRelease: ReleaseBrief = {
      version: "v1",
      source: "mock://x",
      features: [{ id: "f1", title: "Alpha beta", narration: "alpha beta gamma" }],
    };
    const result = matchCommitsToFeatures(singleCommitRelease, [
      commit("dddd00000000000000000000000000000000000005", "feat: alpha support"),
      commit("eeee00000000000000000000000000000000000006", "feat: beta gamma"),
    ]);
    expect(result.pack.entries).toHaveLength(2);
    expect(result.entryPoints).toHaveLength(1);
    expect(result.entryPoints[0]?.confidence).toBe(
      Math.max(...result.pack.entries.map((entry) => entry.confidence)),
    );
  });

  it("gives zero evidence to features whose CJK tokens never match", () => {
    const result = matchCommitsToFeatures(release, rangeCommits);
    const cjkEntries = result.pack.entries.filter(
      (entry) => entry.featureId === "section-2-section",
    );
    // 企业微信办公能力 is pure CJK: no Latin tokens, no hits — but 「感知」
    // section-1's tokens don't leak into it either.
    expect(cjkEntries).toEqual([]);
    expect(result.entryPoints.some((c) => c.featureId === "section-2-section")).toBe(false);
  });

  it("produces an empty pack and no candidates when nothing matches", () => {
    const result = matchCommitsToFeatures(release, [
      commit("ffff00000000000000000000000000000000000007", "feat(ontology): unrelated work"),
    ]);
    expect(result.pack.entries).toEqual([]);
    expect(result.entryPoints).toEqual([]);
    expect(evidencePackSchema.safeParse(result.pack).success).toBe(true);
  });

  it("matches path segments with word boundary and ≥4-char prefix", () => {
    const routingRelease: ReleaseBrief = {
      version: "v1",
      source: "mock://x",
      features: [{ id: "f-route", title: "Routing", narration: "route setup" }],
    };
    // `routing` (≥4 chars) prefix-matches the path segment word `router`;
    // `route` matches by word boundary.
    const result = matchCommitsToFeatures(routingRelease, [
      commit("11110000000000000000000000000000000000000008", "feat: plumbing", [
        "perception-router.ts",
      ]),
    ]);
    const entries = result.pack.entries.filter((entry) => entry.featureId === "f-route");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]?.confidence).toBeGreaterThanOrEqual(0.2);
    expect(result.entryPoints.map((candidate) => candidate.id)).toEqual(["entry-f-route"]);
  });

  it("orders equal-score entries by commit hash lexicographically", () => {
    const tieRelease: ReleaseBrief = {
      version: "v1",
      source: "mock://x",
      features: [{ id: "f1", title: "Alpha", narration: "alpha" }],
    };
    const result = matchCommitsToFeatures(tieRelease, [
      commit("eeee00000000000000000000000000000000000009", "feat: alpha one"),
      commit("dddd00000000000000000000000000000000000010", "fix: alpha two"),
    ]);
    expect(result.pack.entries.map((entry) => entry.reference.location.slice(0, 4))).toEqual([
      "dddd",
      "eeee",
    ]);
  });

  it("derives deterministic ids repeated across runs", () => {
    const first = matchCommitsToFeatures(release, rangeCommits);
    const second = matchCommitsToFeatures(release, rangeCommits);
    expect(first).toEqual(second);
 expect(first.pack.entries.every((entry) => entry.id.startsWith("ev-section-1-im-") || entry.id.startsWith("ev-section-2-section-"))).toBe(true);
  });
});

describe("deriveEntryCandidates", () => {
  it("returns no candidates for a pack without entries", () => {
    const pack = { releaseVersion: "v1", entries: [] };
    const releaseBrief: ReleaseBrief = {
      version: "v1",
      source: "mock://x",
      features: [{ id: "f1", title: "T", narration: "N" }],
    };
    expect(deriveEntryCandidates(releaseBrief, pack)).toEqual([]);
  });
});
