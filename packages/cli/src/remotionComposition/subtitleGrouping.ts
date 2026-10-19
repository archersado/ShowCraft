import type { SubtitleCue } from "@showcraft/core";

export type SubtitleGroup = { text: string; startMs: number; endMs: number };

const SENTENCE_END = /[。！？!?；;]$/u;
const MAX_GROUP_MS = 3_500;
const MAX_GAP_MS = 800;
const LATIN_OR_NUMBER = /[A-Za-z0-9]/u;

/** Deterministically turn word-level cues into readable sentence-sized cards. */
export function groupSubtitleCues(cues: readonly SubtitleCue[]): SubtitleGroup[] {
  const valid = cues
    .filter((cue) => cue.text.trim() && cue.startMs >= 0 && cue.endMs > cue.startMs)
    .slice()
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const groups: SubtitleGroup[] = [];
  let current: SubtitleGroup | undefined;
  for (const cue of valid) {
    if (current && cue.startMs - current.endMs > MAX_GAP_MS) {
      groups.push(current);
      current = undefined;
    }
    if (!current) {
      current = { text: cue.text.trim(), startMs: cue.startMs, endMs: cue.endMs };
    } else {
      const next = cue.text.trim();
      const separator = LATIN_OR_NUMBER.test(current.text.at(-1) ?? "") && LATIN_OR_NUMBER.test(next[0] ?? "")
        ? " "
        : "";
      current.text += `${separator}${next}`;
      current.endMs = Math.max(current.endMs, cue.endMs);
    }
    if (SENTENCE_END.test(cue.text.trim()) || current.endMs - current.startMs >= MAX_GROUP_MS) {
      groups.push(current);
      current = undefined;
    }
  }
  if (current) groups.push(current);
  return groups;
}
