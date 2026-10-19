import { describe, expect, it } from "vitest";

import { groupSubtitleCues } from "./subtitleGrouping.js";

describe("groupSubtitleCues", () => {
  it("groups words until punctuation and remains deterministic", () => {
    const cues = [
      { text: "你好", startMs: 0, endMs: 300 },
      { text: "，", startMs: 300, endMs: 400 },
      { text: "世界。", startMs: 400, endMs: 900 },
      { text: "下一句", startMs: 1_000, endMs: 1_500 },
    ];
    expect(groupSubtitleCues(cues)).toEqual([
      { text: "你好，世界。", startMs: 0, endMs: 900 },
      { text: "下一句", startMs: 1_000, endMs: 1_500 },
    ]);
    expect(groupSubtitleCues(cues)).toEqual(groupSubtitleCues(cues));
  });

  it("splits a long unpunctuated window and tolerates empty or invalid cues", () => {
    expect(groupSubtitleCues([])).toEqual([]);
    expect(groupSubtitleCues([
      { text: "长句", startMs: 0, endMs: 3_600 },
      { text: "", startMs: 4_000, endMs: 4_100 },
      { text: "坏", startMs: 5_000, endMs: 4_900 },
    ])).toEqual([{ text: "长句", startMs: 0, endMs: 3_600 }]);
  });

  it("splits after silence and spaces adjacent Latin word cues", () => {
    expect(groupSubtitleCues([
      { text: "Hello", startMs: 0, endMs: 200 },
      { text: "world", startMs: 220, endMs: 500 },
      { text: "again", startMs: 1_500, endMs: 1_800 },
    ])).toEqual([
      { text: "Hello world", startMs: 0, endMs: 500 },
      { text: "again", startMs: 1_500, endMs: 1_800 },
    ]);
  });
});
