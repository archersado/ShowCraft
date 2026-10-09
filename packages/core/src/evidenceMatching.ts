import type {
  EntryPointCandidate,
  EvidenceEntry,
  EvidencePack,
  ReleaseBrief,
  ReleaseFeature,
} from "./domain.js";
import type { EvidenceResult } from "./ports.js";
import { entryPointCandidateSchema, evidenceEntrySchema } from "./domain.js";

/**
 * Deterministic feature ↔ commit matching for the evidence stage. Pure
 * functions over in-memory commit data — no I/O, no git, no LLM. The CLI git
 * adapter collects commits and feeds them to `matchCommitsToFeatures`.
 *
 * Matching rule (story 2.3 plan, frozen): Latin tokens (≥2 chars, lowercased;
 * CJK skipped) from each feature's title + narration are matched against
 * commit subjects, `type(scope):` scopes and changed-file path segments by
 * word boundary (or ≥4-char prefix, covering inflections like routing↔router).
 * Confidence weights: subject hit 0.4, bullet-derived token hitting subject
 * 0.25, path segment hit 0.2 — clamped to [0,1], deterministic output.
 */

/** One commit as collected by the adapter; plain data, no git dependency. */
export type CommitRecord = {
  /** Full 40-char hash; also the tie-breaker for stable ordering. */
  hash: string;
  /** Commit subject line (first line of the message). */
  subject: string;
  /** Scope from a Conventional Commit subject, lowercased; empty otherwise. */
  scope: string;
  /** Path segments of the files changed by this commit (deduped). */
  pathSegments: string[];
  /** True when the commit has no changed files in a `log --name-only` walk. */
  isMerge: boolean;
};

export type EvidenceWeights = {
  /** Token from the feature title hitting the commit subject. */
  titleTokenInSubject: number;
  /** Token from the narration bullets hitting the commit subject. */
  narrationTokenInSubject: number;
  /** Token hitting a changed-file path segment. */
  pathSegment: number;
};

const DEFAULT_WEIGHTS: EvidenceWeights = {
  titleTokenInSubject: 0.4,
  narrationTokenInSubject: 0.25,
  pathSegment: 0.2,
};

/** Latin word tokens (≥2 chars) lowercased; CJK and shorter words skipped. */
export function collectTokens(text: string): string[] {
  const rawWords = text.toLowerCase().split(/[^a-z0-9]+/);
  const tokens: string[] = [];
  for (const word of rawWords) {
    // ≥2 chars keeps Latin words only — CJK never appears inside [a-z0-9].
    if (word.length < 2) {
      continue;
    }
    if (!tokens.includes(word)) {
      tokens.push(word);
    }
  }
  return tokens;
}

/** Word-boundary match, or prefix match when the token is ≥4 characters. */
function tokenMatches(token: string, words: readonly string[]): boolean {
  for (const word of words) {
    if (word === token) {
      return true;
    }
    if (token.length >= 4 && (word.startsWith(token) || token.startsWith(word))) {
      return true;
    }
  }
  return false;
}

function splitWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

function subjectWords(subject: string): string[] {
  // Strip a Conventional Commit `type(scope):` prefix so the scope does not
  // double-count as a subject word; scope is scored separately.
  const withoutPrefix = subject.replace(/^[a-zA-Z]+(\([^)]*\))?!?:\s*/, "");
  return splitWords(withoutPrefix);
}

/** Words inside a changed-file path: split segment on non-alphanumerics. */
function pathWords(pathSegments: readonly string[]): string[] {
  return pathSegments.flatMap((segment) => splitWords(segment));
}

export function parseScope(subject: string): string {
  const match = /^[a-zA-Z]+(?:\(([^)]*)\))?!?:/.exec(subject);
  const scope = match?.[1]?.trim().toLowerCase() ?? "";
  return /^[a-z0-9][a-z0-9._-]*$/.test(scope) ? scope : "";
}

/** Score one commit against one feature; 0 means no hit. */
function scoreCommit(
  feature: ReleaseFeature,
  titleTokens: string[],
  narrationTokens: string[],
  commit: CommitRecord,
  weights: EvidenceWeights,
): number {
  let score = 0;
  const subject = subjectWords(commit.subject);
  const paths = pathWords(commit.pathSegments);

  for (const token of titleTokens) {
    if (tokenMatches(token, subject)) {
      score += weights.titleTokenInSubject;
    }
    if (tokenMatches(token, paths)) {
      score += weights.pathSegment;
    }
  }
  for (const token of narrationTokens) {
    if (tokenMatches(token, subject)) {
      score += weights.narrationTokenInSubject;
    }
    if (tokenMatches(token, paths)) {
      score += weights.pathSegment;
    }
  }
  return Math.min(1, score);
}

/**
 * Match every feature against the collected commits and build the evidence
 * pack plus entry-point candidates. Deterministic: entries keep commit order
 * (ties broken by hash lexicographic order) and every hit is kept — the
 * highest-confidence entry per feature also yields its entry candidate.
 */
export function matchCommitsToFeatures(
  release: ReleaseBrief,
  commits: readonly CommitRecord[],
  weights: EvidenceWeights = DEFAULT_WEIGHTS,
): EvidenceResult {
  const entries: EvidenceEntry[] = [];

  for (const feature of release.features) {
    const titleTokens = collectTokens(feature.title);
    const narrationTokens = collectTokens(feature.narration);
    // Only narration bullets are "bullet-derived"; the title itself is not a
    // bullet, so keep narration tokens separate from the title's 0.4 weight.
    const scored = commits
      .map((commit) => ({ commit, score: scoreCommit(feature, titleTokens, narrationTokens, commit, weights) }))
      .filter((hit) => hit.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || (a.commit.hash < b.commit.hash ? -1 : a.commit.hash > b.commit.hash ? 1 : 0),
      );

    for (const hit of scored) {
      entries.push(
        evidenceEntrySchema.parse({
          id: `ev-${feature.id}-${hit.commit.hash.slice(0, 12)}`,
          featureId: feature.id,
          kind: "commit",
          reference: {
            location: hit.commit.hash,
            excerpt: hit.commit.subject,
          },
          confidence: hit.score,
        }),
      );
    }
  }

  const pack: EvidencePack = { releaseVersion: release.version, entries };
  return { pack, entryPoints: deriveEntryCandidates(release, pack) };
}

/**
 * Derive one entry-point candidate per feature from its highest-confidence
 * evidence. Ids are stable (`entry-<featureId>`); confidence is the maximum
 * of the cited evidence. Features without evidence get no candidate.
 */
export function deriveEntryCandidates(
  release: ReleaseBrief,
  pack: EvidencePack,
): EntryPointCandidate[] {
  const candidates: EntryPointCandidate[] = [];
  for (const feature of release.features) {
    const entries = pack.entries
      .filter((entry) => entry.featureId === feature.id)
      .sort((a, b) => b.confidence - a.confidence);
    const best = entries[0];
    if (!best) {
      continue;
    }
    candidates.push(
      entryPointCandidateSchema.parse({
        id: `entry-${feature.id}`,
        featureId: feature.id,
        description: `根据代码证据定位的功能入口：${feature.title}`,
        confidence: best.confidence,
        evidenceIds: [best.id],
      }),
    );
  }
  return candidates;
}
