import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { CommitRecord } from "@showcraft/core";
import { parseScope } from "@showcraft/core";

/**
 * Read-only Git evidence adapter. All access goes through `execFile("git", […])`
 * with array arguments (no shell interpolation) and the global
 * `--no-optional-locks` option placed BEFORE the subcommand (it is a global
 * git option; placing it after the subcommand fails on git ≥2.50). Only
 * `log`, `diff-tree` and `tag` are ever invoked. The StartUpOS working tree
 * is never read — only the object database is queried.
 */

const execFileAsync = promisify(execFile);

/** Only these git subcommands may run; everything else is refused. */
const ALLOWED_SUBCOMMANDS = new Set(["log", "diff-tree", "tag"]);

/** Tag names must be plain version-ish strings; anything else is refused. */
const TAG_PATTERN = /^[0-9A-Za-z.-]+$/;

/** Range endpoints must be `desktop-…` release tags (never refs like HEAD). */
const RANGE_ENDPOINT_PATTERN = /^desktop-[0-9A-Za-z.-]+$/;

/** Commit refs must be full 40-char lowercase hex hashes. */
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40}$/;

export class GitEvidenceError extends Error {
  constructor(
    readonly reason: "not_a_git_repo" | "unsafe_argument" | "git_failed",
    message: string,
  ) {
    super(message);
    this.name = "GitEvidenceError";
  }
}

/** Whitelist an externally-derived git argument before it reaches execFile. */
function assertSafeArgument(kind: "tag" | "commit-hash", value: string): string {
  const safe = kind === "tag" ? TAG_PATTERN.test(value) : COMMIT_HASH_PATTERN.test(value);
  if (!safe) {
    throw new GitEvidenceError(
      "unsafe_argument",
      `Refusing unsafe git ${kind} argument: ${value}`,
    );
  }
  return value;
}

/**
 * Walk up from the changelog's directory looking for a `.git` entry. Only
 * existence metadata is probed — no file contents of the target worktree are
 * ever read. Returns null when no repository root is found.
 */
export async function discoverGitRepo(changelogPath: string): Promise<string | null> {
  let current = dirname(changelogPath);
  while (true) {
    try {
      await access(join(current, ".git"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }
}

/** Run one read-only git command in the repository root. */
async function git(repoRoot: string, args: readonly string[]): Promise<string> {
  const subcommand = args[0];
  if (!subcommand || !ALLOWED_SUBCOMMANDS.has(subcommand)) {
    throw new GitEvidenceError("unsafe_argument", `Git subcommand not allowed: ${String(subcommand)}`);
  }
  // `--no-optional-locks` is a global option and must precede the subcommand.
  const argv = ["--no-optional-locks", ...args];
  try {
    const { stdout } = await execFileAsync("git", argv, { cwd: repoRoot });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GitEvidenceError("git_failed", `git ${String(subcommand)} failed: ${message}`);
  }
}

/** The previous `desktop-v*` tag before `version`, or null when none exists. */
export function previousDesktopTag(tags: readonly string[], version: string): string | null {
  const currentTag = `desktop-${version}`;
  const sorted = [...tags]
    .filter((tag) => /^desktop-v[0-9A-Za-z.-]+$/.test(tag))
    .sort(compareVersionTags);
  const index = sorted.indexOf(currentTag);
  return index > 0 ? sorted[index - 1]! : null;
}

function compareVersionTags(a: string, b: string): number {
  const va = a.replace(/^desktop-/, "").split(/[.-]/).map(Number);
  const vb = b.replace(/^desktop-/, "").split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
    const na = Number.isFinite(va[i]) ? va[i]! : -1;
    const nb = Number.isFinite(vb[i]) ? vb[i]! : -1;
    if (na !== nb) {
      return na - nb;
    }
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export type TagRange = {
  fromTag: string | null;
  toTag: string;
};

/**
 * Derive the tag range `desktop-<previous>..desktop-<version>`. The previous
 * tag comes from the repo's `desktop-v*` tag list (StartUpOS has no changelog
 * files for older releases). Returns fromTag=null for the first release.
 */
export async function resolveTagRange(
  version: string,
  repoRoot: string,
): Promise<TagRange | null> {
  const toTag = `desktop-${version}`;
  if (!TAG_PATTERN.test(toTag)) {
    return null;
  }
  const listing = await git(repoRoot, ["tag", "--list", "desktop-v*"]);
  const tags = listing.split("\n").map((tag) => tag.trim()).filter(Boolean);
  const previous = previousDesktopTag(tags, version);
  return { fromTag: previous, toTag };
}

/** One parsed record per commit from the `log --format` output. */
function parseCommitLog(stdout: string): CommitRecord[] {
  const commits: CommitRecord[] = [];
  // Each record is `<hash>\x1f<subject>\x1e\n<file lines…>` — the \x1e
  // terminates the header and the newline after it opens the file list.
  // Merge commits have no file list under --name-only.
  const lines = stdout.split("\n");
  let current: { hash: string; subject: string; files: string[] } | undefined;
  const flush = (): void => {
    if (!current || !COMMIT_HASH_PATTERN.test(current.hash)) {
      return;
    }
    const pathSegments: string[] = [];
    for (const file of current.files) {
      for (const segment of file.split("/")) {
        if (segment !== "" && !pathSegments.includes(segment)) {
          pathSegments.push(segment);
        }
      }
    }
    commits.push({
      hash: current.hash,
      subject: current.subject,
      scope: parseScope(current.subject),
      pathSegments,
      isMerge: current.files.length === 0,
    });
  };

  for (const line of lines) {
    const headerEnd = line.indexOf("\x1e");
    if (headerEnd !== -1) {
      // Finish the previous record, then open a new one from this header.
      flush();
      const [hash = "", subject = ""] = line.slice(0, headerEnd).split("\x1f");
      current = { hash, subject, files: [] };
      continue;
    }
    if (current) {
      const file = line.trim();
      if (file !== "") {
        current.files.push(file);
      }
    }
  }
  flush();
  return commits;
}

/**
 * Collect every commit in `range` (or the whole history when fromTag is
 * null) as plain CommitRecords, newest first.
 */
export async function collectCommits(
  range: TagRange,
  repoRoot: string,
): Promise<CommitRecord[]> {
  const span = range.fromTag ? `${range.fromTag}..${range.toTag}` : range.toTag;
  // Both endpoints are whitelist-validated release tags before touching git.
  for (const part of span.split("..")) {
    if (!RANGE_ENDPOINT_PATTERN.test(part)) {
      throw new GitEvidenceError(
        "unsafe_argument",
        `Refusing non-release tag range endpoint: ${part}`,
      );
    }
  }
  const stdout = await git(repoRoot, [
    "log",
    `--format=%H%x1f%s%x1e`,
    "--name-only",
    "--encoding=UTF-8",
    span,
  ]);
  return parseCommitLog(stdout);
}

/**
 * Fetch the first diff hunk of a commit as a symbol sample. Read-only
 * `diff-tree -p -U0`; empty for merge commits (they have no unified diff).
 */
export async function collectDiffSample(
  commitHash: string,
  repoRoot: string,
): Promise<string | undefined> {
  assertSafeArgument("commit-hash", commitHash);
  const stdout = await git(repoRoot, [
    "diff-tree",
    "-p",
    "-U0",
    "--no-commit-id",
    "-r",
    commitHash,
  ]);
  const firstHunk = stdout.split("\n@@")[0];
  const sample = firstHunk?.trim();
  return sample && sample.length > 0 ? sample.slice(0, 2000) : undefined;
}
