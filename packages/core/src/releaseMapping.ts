import type { FeatureSourceRef, ReleaseFeature } from "./domain.js";
import type { ReleaseSection } from "./releaseSource.js";

/**
 * Section → feature normalization for parsed release documents. Pure
 * functions only — file access and pipeline assembly stay in the CLI.
 *
 * id contract: `section-N-slug` where N is the 1-based section ordinal. The
 * ordinal keeps ids unique across duplicate headings and slug fallbacks
 * (e.g. CJK-only titles slugify to "section") while staying stable in
 * document order; the human-readable heading lives on `sourceRef.sectionTitle`.
 */

const UNTITLED_SECTION = "未命名段落";
const NARRATION_SEPARATOR = "；";

/** Lowercase ASCII slug of a heading; empty or non-ASCII results fall back to "section". */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Normalize parsed `##` sections into release features, one per section in
 * document order. Every feature carries a full `sourceRef` line range taken
 * verbatim from the parsed section.
 */
export function normalizeSectionsToFeatures(sections: readonly ReleaseSection[]): ReleaseFeature[] {
  return sections.map((section, index) => {
    const title = section.title.trim() || UNTITLED_SECTION;
    const narration =
      section.bullets
        .map((bullet) => bullet.trim())
        .filter((bullet) => bullet.length > 0)
        .join(NARRATION_SEPARATOR) || title;
    const sourceRef: FeatureSourceRef = {
      sectionIndex: index + 1,
      sectionTitle: title,
      startLine: section.startLine,
      endLine: section.endLine,
    };
    return {
      id: `section-${index + 1}-${slugifyTitle(title)}`,
      title,
      narration,
      sourceRef,
    };
  });
}
