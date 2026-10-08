import { describe, expect, it } from "vitest";

import { applyConfidenceGate, gateThreshold } from "./confidenceGate.js";
import type { ReleaseBrief } from "./index.js";
import type { EntryPointCandidate, EvidencePack } from "./index.js";

/**
 * I/O & edge-case matrix from the approved story 2.4 plan, locked as unit
 * tests over in-memory fixtures (the gate is a pure core function).
 */

const release: ReleaseBrief = {
  version: "v0.3.3",
  source: "mock://showcraft/demo-release",
  features: [
    { id: "f-strong", title: "感知与 IM 路由", narration: "强证据 feature" },
    { id: "f-weak", title: "低置信度功能", narration: "弱证据 feature" },
    { id: "f-none", title: "企业微信办公能力", narration: "无证据 feature" },
  ],
};

const entry = (id: string, featureId: string, confidence: number, location = "a".repeat(40)) => ({
  id,
  featureId,
  kind: "commit" as const,
  reference: { location },
  confidence,
});

const candidate = (
  id: string,
  featureId: string,
  confidence: number,
  evidenceIds: string[],
): EntryPointCandidate => ({
  id,
  featureId,
  description: "入口候选",
  confidence,
  evidenceIds,
});

function gate(
  entries: EvidencePack["entries"],
  entryPointList: EntryPointCandidate[],
  threshold?: number,
) {
  const pack: EvidencePack = { releaseVersion: release.version, entries };
  return applyConfidenceGate(release, pack, entryPointList, threshold);
}

describe("gateThreshold", () => {
  it("is the plan-decided constant 0.8 within the confidence domain [0,1]", () => {
    expect(gateThreshold).toBe(0.8);
    expect(gateThreshold).toBeGreaterThanOrEqual(0);
    expect(gateThreshold).toBeLessThanOrEqual(1);
  });
});

describe("applyConfidenceGate: classification", () => {
  it("marks a feature without any evidence as no_evidence with an explicit record", () => {
    const result = gate([], []);
    expect(result.decisions).toHaveLength(3);
    const none = result.decisions.find((d) => d.featureId === "f-none");
    expect(none).toEqual({
      featureId: "f-none",
      reason: "no_evidence",
      automatable: false,
      evidenceIds: [],
    });
  });

  it("marks a candidate below the threshold as below_threshold citing its evidence", () => {
    const result = gate(
      [entry("ev-1", "f-weak", 0.4), entry("ev-2", "f-weak", 0.2)],
      [candidate("entry-f-weak", "f-weak", 0.4, ["ev-1"])],
    );
    const weak = result.decisions.find((d) => d.featureId === "f-weak");
    expect(weak).toEqual({
      featureId: "f-weak",
      reason: "below_threshold",
      automatable: false,
      confidence: 0.4,
      evidenceIds: ["ev-1"],
    });
  });

  it("marks a candidate at exactly the threshold as eligible (>= boundary, including 0.4+0.4)", () => {
    // 0.4 + 0.4 accumulates to exactly 0.8 under IEEE 754 — the locked edge.
    const exactlyThreshold = 0.4 + 0.4;
    expect(exactlyThreshold).toBe(0.8);
    const result = gate([entry("ev-1", "f-strong", exactlyThreshold)], [
      candidate("entry-f-strong", "f-strong", exactlyThreshold, ["ev-1"]),
    ]);
    const strong = result.decisions.find((d) => d.featureId === "f-strong");
    expect(strong).toEqual({
      featureId: "f-strong",
      reason: "eligible",
      automatable: true,
      confidence: 0.8,
      evidenceIds: ["ev-1"],
    });
  });

  it("keeps float neighbors below the threshold eligible-false (0.4+0.2 stays 0.6000…1)", () => {
    const justBelow = 0.4 + 0.2;
    expect(justBelow).toBe(0.6000000000000001);
    expect(justBelow < gateThreshold).toBe(true);
    const result = gate([entry("ev-1", "f-weak", justBelow)], [candidate("entry-f-weak", "f-weak", justBelow, ["ev-1"])]);
    expect(result.decisions.find((d) => d.featureId === "f-weak")?.reason).toBe("below_threshold");
  });

  it("admits the other reachable 0.8 accumulation paths (0.4+0.2+0.2 and 0.2×4)", () => {
    for (const score of [0.4 + 0.2 + 0.2, 0.2 * 4]) {
      expect(score).toBe(0.8);
      const result = gate([entry("ev-1", "f-strong", score)], [candidate("entry-f-strong", "f-strong", score, ["ev-1"])]);
      expect(result.decisions.find((d) => d.featureId === "f-strong")?.automatable).toBe(true);
    }
  });

  it("treats evidence without a matching candidate as no_evidence (candidate is the automation carrier)", () => {
    const result = gate([entry("ev-1", "f-none", 1)], []);
    expect(result.decisions.find((d) => d.featureId === "f-none")?.reason).toBe("no_evidence");
  });

  it("picks the best candidate when several exist for one feature", () => {
    const result = gate(
      [entry("ev-1", "f-weak", 0.6), entry("ev-2", "f-weak", 0.95)],
      [candidate("entry-f-weak", "f-weak", 0.6, ["ev-1"]), candidate("entry-f-weak-high", "f-weak", 0.95, ["ev-2"])],
    );
    const weak = result.decisions.find((d) => d.featureId === "f-weak");
    expect(weak?.reason).toBe("eligible");
    expect(weak?.confidence).toBe(0.95);
    expect(weak?.evidenceIds).toEqual(["ev-2"]);
  });

  it("produces the v0.3.3 matrix: three eligible, one no_evidence, mixed reasons", () => {
    const entries = [
      entry("ev-1", "f-strong", 0.8500000000000001),
      entry("ev-2", "f-weak", 0.7),
      entry("ev-3", "f-none", 1),
    ].filter((e) => e.featureId !== "f-none");
    const result = gate(
      entries,
      entries.map((e) => candidate(`entry-${e.featureId}`, e.featureId, e.confidence, [e.id])),
    );
    expect(result.decisions.map((d) => d.reason)).toEqual([
      "eligible",
      "below_threshold",
      "no_evidence",
    ]);
    expect(result.decisions.every((d, i) => d.featureId === release.features[i]?.id)).toBe(true);
  });

  it("gates every feature when none reaches the threshold while keeping the run shape", () => {
    const result = gate(
      [entry("ev-1", "f-strong", 0.5), entry("ev-2", "f-weak", 0.25)],
      [candidate("entry-f-strong", "f-strong", 0.5, ["ev-1"]), candidate("entry-f-weak", "f-weak", 0.25, ["ev-2"])],
    );
    expect(result.decisions.every((d) => d.automatable === false)).toBe(true);
    expect(result.decisions.every((d) => d.reason !== "eligible")).toBe(true);
  });

  it("supports a custom threshold parameter", () => {
    const result = gate([entry("ev-1", "f-weak", 0.7)], [candidate("entry-f-weak", "f-weak", 0.7, ["ev-1"])], 0.5);
    expect(result.threshold).toBe(0.5);
    expect(result.decisions.find((d) => d.featureId === "f-weak")?.automatable).toBe(true);
  });

  it("is deterministic: identical inputs yield byte-identical results", () => {
    const entries = [entry("ev-1", "f-strong", 0.9), entry("ev-2", "f-weak", 0.3)];
    const candidates = [candidate("f-strong", 0.9, ["ev-1"]), candidate("f-weak", 0.3, ["ev-2"])];
    const first = gate(entries, candidates);
    const second = gate([...entries].reverse(), [...candidates].reverse());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
