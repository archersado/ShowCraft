import { describe, expect, it } from "vitest";

import { normalizeSectionsToFeatures, slugifyTitle } from "./releaseMapping.js";
import { parseReleaseDocument } from "./releaseSource.js";
import { releaseBriefSchema } from "./domain.js";
import type { ReleaseSection } from "./releaseSource.js";

function section(title: string, startLine: number, endLine: number, bullets: string[]): ReleaseSection {
  return { title, startLine, endLine, bullets };
}

describe("slugifyTitle", () => {
  it("slugs ASCII headings and collapses separators", () => {
    expect(slugifyTitle("Perception & IM Routing!")).toBe("perception-im-routing");
    expect(slugifyTitle("  Agent Collaboration  ")).toBe("agent-collaboration");
  });

  it("falls back to 'section' for empty or non-ASCII-only headings", () => {
    expect(slugifyTitle("")).toBe("section");
    // CJK-only headings contain no ASCII slug characters at all.
    expect(slugifyTitle("验证")).toBe("section");
    // Mixed CJK/Latin headings keep their ASCII fragments.
    expect(slugifyTitle("感知与 IM 路由")).toBe("im");
  });
});

describe("normalizeSectionsToFeatures", () => {
  it("maps a multi-section document in order with section-N-slug ids and sourceRefs", () => {
    const document = parseReleaseDocument(
      [
        "# OriginOS CE v0.3.3",
        "",
        "## 感知与 IM 路由",
        "",
        "- bullet a",
        "- bullet b",
        "",
        "## 企业微信办公能力",
        "",
        "- bullet c",
        "",
      ].join("\n"),
    );
    const features = normalizeSectionsToFeatures(document.sections);

    // "感知与 IM 路由" slugs to "im"; the CJK-only second heading falls back to "section".
    expect(features.map((feature) => feature.id)).toEqual(["section-1-im", "section-2-section"]);
    expect(features.map((feature) => feature.title)).toEqual(["感知与 IM 路由", "企业微信办公能力"]);
    // endLine extends through the blank line before the next heading
    // (parseReleaseDocument's locked line-range semantics).
    expect(features.map((feature) => feature.sourceRef)).toEqual([
      { sectionIndex: 1, sectionTitle: "感知与 IM 路由", startLine: 3, endLine: 7 },
      { sectionIndex: 2, sectionTitle: "企业微信办公能力", startLine: 8, endLine: 11 },
    ]);
    expect(features.map((feature) => feature.narration)).toEqual(["bullet a；bullet b", "bullet c"]);
  });

  it("falls back narration to the section title when the section has no bullets", () => {
    const features = normalizeSectionsToFeatures([section("验证", 5, 5, [])]);
    expect(features).toHaveLength(1);
    expect(features[0]?.narration).toBe("验证");
    expect(features[0]?.sourceRef).toEqual({
      sectionIndex: 1,
      sectionTitle: "验证",
      startLine: 5,
      endLine: 5,
    });
  });

  it("treats whitespace-only bullets as no bullets", () => {
    const features = normalizeSectionsToFeatures([section("验证", 5, 7, ["   ", "\t"])]);
    expect(features[0]?.narration).toBe("验证");
  });

  it("falls back the title and sectionTitle to 未命名段落 for a blank heading", () => {
    // A bare "- point" line is verbatim bullet text; parseReleaseDocument
    // strips only the leading "- " marker, so the blank heading's bullet
    // keeps "- point" and narration falls back... except bullets are joined
    // verbatim, so expect the raw marker text here.
    const features = normalizeSectionsToFeatures([section("   ", 4, 4, ["- point"])]);
    expect(features[0]?.title).toBe("未命名段落");
    expect(features[0]?.sourceRef?.sectionTitle).toBe("未命名段落");
    expect(features[0]?.narration).toBe("- point");
    expect(features[0]?.id).toBe("section-1-section");
  });

  it("keeps duplicate headings from colliding via the ordinal", () => {
    const features = normalizeSectionsToFeatures([
      section("同一标题", 1, 2, []),
      section("同一标题", 3, 4, []),
    ]);
    expect(features.map((feature) => feature.id)).toEqual([
      "section-1-section",
      "section-2-section",
    ]);
    expect(new Set(features.map((feature) => feature.id)).size).toBe(2);
  });

  it("returns an empty array for a document without sections", () => {
    expect(normalizeSectionsToFeatures([])).toEqual([]);
  });

  it("produces features that pass the strict releaseBriefSchema", () => {
    const document = parseReleaseDocument("# Demo v1.2.3\n\n## Alpha\n\n- first feature\n");
    const brief = {
      version: document.version ?? "v1.2.3",
      source: "memory.md",
      features: normalizeSectionsToFeatures(document.sections),
    };
    const result = releaseBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });
});
