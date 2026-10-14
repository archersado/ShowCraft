import type { EntryPointCandidate, EvidencePack, GateDecision, GateResult, ReleaseBrief } from "./domain.js";

/**
 * Deterministic confidence gate for entry-point candidates (story 2.4). Pure
 * classification over in-memory data — no I/O, no LLM. The gate never deletes
 * evidence or candidates; it only labels each feature `eligible` or gated, so
 * low-confidence candidates stay auditable while being barred from automation.
 *
 * Spec authority: openspec/changes/showcraft-release-video-mvp/specs/
 * code-evidence-discovery/spec.md (Requirement「保护低置信度候选」).
 * Design authority: openspec/changes/showcraft-release-video-mvp/design.md
 * (证据门禁先于桌面操作).
 */

/**
 * Initial confidence threshold, decided per the approved story 2.4 plan as the
 * answer to design.md's open question. 0.8 = two independent title-token
 * subject hits (0.4 + 0.4); every weight below it can be produced by a single
 * incidental token or path-segment hit. Fixed in code — not a CLI parameter —
 * until a real need for per-product configuration emerges.
 */
export const gateThreshold = 0.8;

/**
 * Classify each release feature against `threshold`:
 * - no evidence entries at all → `no_evidence`, not automatable, no candidate;
 * - otherwise the feature's entry-point candidates carry its best confidence
 *   (candidates always exist when entries do — one per feature, citing the
 *   highest-confidence entry): ≥ threshold → `eligible`, automatable;
 * - < threshold → `below_threshold`, not automatable, citing the candidate's
 *   evidence for audit.
 *
 * Decisions come out in feature order for stable, byte-identical output.
 */
export function applyConfidenceGate(
  release: ReleaseBrief,
  evidence: EvidencePack,
  entryPoints: readonly EntryPointCandidate[],
  threshold: number = gateThreshold,
): GateResult {
  const decisions: GateDecision[] = release.features.map((feature) => {
    const hasEvidence = evidence.entries.some((entry) => entry.featureId === feature.id);
    const candidates = entryPoints
      .filter((candidate) => candidate.featureId === feature.id)
      .sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];

    if (!hasEvidence || !best) {
      return { featureId: feature.id, reason: "no_evidence", automatable: false, evidenceIds: [] };
    }
    if (best.confidence < threshold) {
      return {
        featureId: feature.id,
        reason: "below_threshold",
        automatable: false,
        confidence: best.confidence,
        evidenceIds: [...best.evidenceIds],
      };
    }
    return {
      featureId: feature.id,
      reason: "eligible",
      automatable: true,
      confidence: best.confidence,
      evidenceIds: [...best.evidenceIds],
    };
  });

  return { releaseVersion: release.version, threshold, decisions };
}
