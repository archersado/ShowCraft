import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  GitEvidenceError,
  collectCommits,
  collectDiffSample,
  discoverGitRepo,
  previousDesktopTag,
  resolveTagRange,
} from "./gitEvidence.js";

const execFileAsync = promisify(execFile);

const temporaryPaths: string[] = [];

afterEach(async () => {
  const paths = temporaryPaths.splice(0);
  await Promise.all(paths.map((path) => rm(path, { force: true, recursive: true })));
});

/** Build a throwaway git repo with two desktop tags and known commits. */
async function makeFixtureRepo(): Promise<{ root: string; edfHash: string; docHash: string }> {
  const root = await mkdtemp(join(tmpdir(), "showcraft-git-fixture-"));
  temporaryPaths.push(root);
  const run = async (...args: string[]) => {
    await execFileAsync("git", args, { cwd: root });
  };
  await run("init", "-b", "main");
  await run("config", "user.email", "fixture@showcraft.test");
  await run("config", "user.name", "ShowCraft Fixture");

  await writeFile(join(root, "perception-router.ts"), "export const route = 1;\n", "utf8");
  await run("add", ".");
  await execFileAsync("git", ["commit", "-m", "feat(perception): add IM routing"], { cwd: root });
  const { stdout: edfHash } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });

  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "changelog.md"), "# v0.3.2\n", "utf8");
  await run("add", ".");
  await execFileAsync("git", ["commit", "-m", "docs: v0.3.2 notes"], { cwd: root });
  await run("tag", "desktop-v0.3.2");

  await writeFile(join(root, "sticky-route-store.ts"), "export const sticky = 1;\n", "utf8");
  await run("add", ".");
  await execFileAsync("git", ["commit", "-m", "feat: sticky route store"], { cwd: root });
  const { stdout: docHash } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  await run("tag", "desktop-v0.3.3");

  return { root, edfHash: edfHash.trim(), docHash: docHash.trim() };
}

describe("discoverGitRepo", () => {
  it("finds the repository root by walking up from the changelog", async () => {
    const fixture = await makeFixtureRepo();
    const nested = join(fixture.root, "docs", "changes", "releases");
    await mkdir(nested, { recursive: true });
    expect(await discoverGitRepo(join(nested, "changelog.md"))).toBe(fixture.root);
  });

  it("returns null outside any repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-nogit-"));
    temporaryPaths.push(root);
    expect(await discoverGitRepo(join(root, "changelog.md"))).toBeNull();
  });
});

describe("resolveTagRange", () => {
  it("derives desktop-v0.3.2..desktop-v0.3.3 from the tag list", async () => {
    const fixture = await makeFixtureRepo();
    const range = await resolveTagRange("v0.3.3", fixture.root);
    expect(range).toEqual({ fromTag: "desktop-v0.3.2", toTag: "desktop-v0.3.3" });
  });

  it("returns null fromTag when the version is the first desktop tag", async () => {
    const fixture = await makeFixtureRepo();
    const range = await resolveTagRange("v0.3.2", fixture.root);
    expect(range).toEqual({ fromTag: null, toTag: "desktop-v0.3.2" });
  });

  it("returns null fromTag when the current version has no tag either", async () => {
    const fixture = await makeFixtureRepo();
    // desktop-v9.9.9 is not in the tag list, so no previous tag can be
    // derived; the later `log` on the missing endpoint fails and is
    // surfaced as an error (degraded to empty entries by the port).
    const range = await resolveTagRange("v9.9.9", fixture.root);
    expect(range).toEqual({ fromTag: null, toTag: "desktop-v9.9.9" });
    await expect(collectCommits(range!, fixture.root)).rejects.toThrow(GitEvidenceError);
  });

  it("refuses versions that produce unsafe tag names", async () => {
    const fixture = await makeFixtureRepo();
    // `desktop-../../etc` fails the tag whitelist → null (no tag path),
    // never an unsafe git argument.
    await expect(resolveTagRange("../../etc", fixture.root)).resolves.toBeNull();
  });
});

describe("collectCommits", () => {
  it("returns commits between the tags with parsed subjects and path segments", async () => {
    const fixture = await makeFixtureRepo();
    const range = await resolveTagRange("v0.3.3", fixture.root);
    const commits = await collectCommits(range!, fixture.root);

    expect(commits).toHaveLength(1);
    const only = commits[0]!;
    expect(only.hash).toBe(fixture.docHash);
    expect(only.subject).toBe("feat: sticky route store");
    expect(only.scope).toBe("");
    expect(only.pathSegments).toContain("sticky-route-store.ts");
    expect(only.isMerge).toBe(false);
  });

  it("marks merge commits without file lists; refuses non-whitelisted refs", async () => {
    const fixture = await makeFixtureRepo();
    // Create a merge commit on a side branch and tag the merge result.
    const run = async (...args: string[]) => execFileAsync("git", args, { cwd: fixture.root });
    await run("checkout", "-qb", "side");
    await writeFile(join(fixture.root, "side.ts"), "export {};\n", "utf8");
    await run("add", ".");
    await run("commit", "-m", "feat(im): side change");
    await run("checkout", "-q", "main");
    await run("merge", "--no-ff", "-m", "merge: bring side in", "side");
    await run("tag", "desktop-v0.3.4");

    const commits = await collectCommits(
      { fromTag: "desktop-v0.3.3", toTag: "desktop-v0.3.4" },
      fixture.root,
    );
    const merge = commits.find((c) => c.subject.startsWith("merge:"));
    expect(merge).toBeDefined();
    expect(merge!.isMerge).toBe(true);
    expect(merge!.pathSegments).toEqual([]);

    // Branch names like HEAD are not whitelisted release tags; the adapter
    // must refuse anything but `desktop-…` shaped endpoints outright.
    await expect(
      collectCommits({ fromTag: null, toTag: "HEAD" as unknown as string }, fixture.root),
    ).rejects.toThrow(/non-release tag range endpoint/);
  });

  it("returns an empty list for an empty range", async () => {
    const fixture = await makeFixtureRepo();
    const commits = await collectCommits(
      { fromTag: "desktop-v0.3.3", toTag: "desktop-v0.3.2" },
      fixture.root,
    );
    expect(commits).toEqual([]);
  });

  it("refuses range components failing the tag whitelist", async () => {
    const fixture = await makeFixtureRepo();
    await expect(
      collectCommits({ fromTag: "desktop-v0.3.2", toTag: "--exec=evil" }, fixture.root),
    ).rejects.toThrow(GitEvidenceError);
  });

  it("wraps git failures (missing tag) into GitEvidenceError", async () => {
    const fixture = await makeFixtureRepo();
    await expect(
      collectCommits({ fromTag: "desktop-v0.0.1", toTag: "desktop-v0.3.2" }, fixture.root),
    ).rejects.toThrow(GitEvidenceError);
  });
});

describe("collectDiffSample", () => {
  it("returns the first hunk header and lines for a normal commit", async () => {
    const fixture = await makeFixtureRepo();
    const sample = await collectDiffSample(fixture.docHash, fixture.root);
    expect(sample).toContain("sticky-route-store.ts");
    expect(sample?.startsWith("diff --git")).toBe(true);
  });

  it("rejects hashes failing the whitelist", async () => {
    const fixture = await makeFixtureRepo();
    await expect(collectDiffSample("short-hash", fixture.root)).rejects.toThrow(GitEvidenceError);
    await expect(collectDiffSample(`${"a".repeat(40)};rm`, fixture.root)).rejects.toThrow(
      GitEvidenceError,
    );
  });
});

describe("previousDesktopTag", () => {
  it("sorts numerically and picks the previous version", () => {
    const tags = ["desktop-v0.3.10", "desktop-v0.3.2", "desktop-v0.3.3"];
    expect(previousDesktopTag(tags, "v0.3.3")).toBe("desktop-v0.3.2");
    expect(previousDesktopTag(tags, "v0.3.10")).toBe("desktop-v0.3.3");
    expect(previousDesktopTag(tags, "v0.3.2")).toBeNull();
    expect(previousDesktopTag([], "v0.3.3")).toBeNull();
  });
});
