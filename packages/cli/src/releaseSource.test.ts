import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { parseDemoArgs, runDemo } from "./main.js";

const temporaryPaths: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

const STARTUPO_CHANGELOG =
  "/Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md";

/** Skip StartUpOS-dependent assertions when the read-only fixture is absent. */
const startuposAvailable = process.platform !== "win32";

describe("runDemo with --source", () => {
  it("keeps mock behavior identical when no source is given", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-mock-"));
    temporaryPaths.push(root);

    const result = await runDemo({ outputRoot: root, runId: "mock-fallback" });

    expect(result.status).toBe("completed");
    const release = JSON.parse(await readFile(join(result.runDirectory, "release.json"), "utf8"));
    expect(release.version).toBe("demo");
    expect(release.source).toBe("mock://showcraft/demo-release");
    // Mock features carry no provenance mapping.
    expect(release.features[0]?.sourceRef).toBeUndefined();
    expect((await readdir(result.runDirectory)).sort()).toEqual(
      ["manifest.json", "release.json", "run.json", "scene.json"].sort(),
    );
  });

  it(startuposAvailable ? "parses the StartUpOS v0.3.3 changelog into features" : "parses a local changelog into features", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-real-"));
    temporaryPaths.push(root);
    const sourcePath = startuposAvailable ? STARTUPO_CHANGELOG : undefined;
    if (!sourcePath) return;

    const result = await runDemo({ outputRoot: root, runId: "v033-source", source: sourcePath });

    expect(result.status).toBe("completed");
    const release = JSON.parse(await readFile(join(result.runDirectory, "release.json"), "utf8"));
    expect(release.version).toBe("v0.3.3");
    expect(release.source).toBe(sourcePath);
    expect(release.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(release.features.map((feature: { title: string }) => feature.title)).toEqual([
      "感知与 IM 路由",
      "企业微信办公能力",
      "Agent 与任务协作",
      "验证",
    ]);
    // Every feature stays linkable back to its section id.
    expect(release.features[0]?.id).toBe("section-1-im");
    expect(release.features.map((feature: { id: string }) => feature.id)).toEqual([
      "section-1-im",
      "section-2-section",
      "section-3-agent",
      "section-4-section",
    ]);
    // Each feature's sourceRef maps 1:1 back to its `##` section heading and
    // line range in the source document (v0.3.3: sections at 5–11/12–17/18–23/24–29).
    const expectedSections: Array<[string, number, number]> = [
      ["感知与 IM 路由", 5, 11],
      ["企业微信办公能力", 12, 17],
      ["Agent 与任务协作", 18, 23],
      ["验证", 24, 29],
    ];
    expectedSections.forEach(([sectionTitle, startLine, endLine], index) => {
      const sourceRef = release.features[index]?.sourceRef;
      expect(sourceRef).toEqual({
        sectionIndex: index + 1,
        sectionTitle,
        startLine,
        endLine,
      });
    });
  });

  it("rejects a directory as release source", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-dir-"));
    temporaryPaths.push(root);

    await expect(
      runDemo({ outputRoot: root, runId: "dir-source", source: root }),
    ).rejects.toThrow(/is a directory/);
    // Rejected before any run directory is created.
    await expect(readFile(join(root, "dir-source", "run.json"), "utf8")).rejects.toThrow();
  });

  it("rejects non-markdown files", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-txt-"));
    temporaryPaths.push(root);
    const notes = join(root, "notes.txt");
    await writeFile(notes, "plain text", "utf8");

    await expect(
      runDemo({ outputRoot: root, runId: "txt-source", source: notes }),
    ).rejects.toThrow(/must be a Markdown/);
  });

  it("refuses to read secret files", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-env-"));
    temporaryPaths.push(root);
    const envFile = join(root, ".env");
    await writeFile(envFile, "TOP_SECRET=1", "utf8");

    await expect(
      runDemo({ outputRoot: root, runId: "env-source", source: envFile }),
    ).rejects.toThrow(/secret/i);
    // The secret's content must never reach the run artifacts.
    const entries = await readdir(root);
    expect(entries).not.toContain("env-source");
  });

  it("rejects missing paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-missing-"));
    temporaryPaths.push(root);

    await expect(
      runDemo({ outputRoot: root, runId: "missing-source", source: join(root, "nope.md") }),
    ).rejects.toThrow(/does not exist/);
  });

  it("declines GitHub URLs while their format stays valid", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-src-url-"));
    temporaryPaths.push(root);

    // Invalid format is rejected outright by the URL parser.
    await expect(
      runDemo({
        outputRoot: root,
        runId: "bad-url",
        source: "https://github.com/o/r/tree/main/CHANGELOG.md",
      }),
    ).rejects.toThrow(/Expected https:\/\/github\.com/);

    // Valid format passes parsing but fetching is a later story.
    await expect(
      runDemo({
        outputRoot: root,
        runId: "good-url",
        source: "https://github.com/o/r/blob/main/CHANGELOG.md",
      }),
    ).rejects.toThrow(/not implemented yet|fetching/i);
  });
});

describe("parseDemoArgs with --source", () => {
  it("accepts output and source together", () => {
    expect(parseDemoArgs(["--output", "runs", "--source", "a.md"])).toEqual({
      outputRoot: "runs",
      source: "a.md",
    });
    expect(parseDemoArgs(["--", "--source", "/tmp/x.md"])).toEqual({ source: "/tmp/x.md" });
  });

  it("still rejects unknown flags and dangling values", () => {
    expect(() => parseDemoArgs(["--unknown", "x"])).toThrow(/Usage:/);
    expect(() => parseDemoArgs(["--source"])).toThrow(/Usage:/);
    expect(parseDemoArgs([])).toEqual({});
  });
});

describe("pnpm demo --source", () => {
  it("reports a completed run sourced from a local markdown file", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "showcraft-src-command-"));
    temporaryPaths.push(outputRoot);
    const markdown = join(outputRoot, "changelog.md");
    await writeFile(markdown, "# Demo v1.2.3\n\n## Alpha\n\n- first feature\n", "utf8");
    const pnpmEntrypoint = process.env.npm_execpath;

    expect(pnpmEntrypoint).toBeTruthy();
    const { stdout } = await execFileAsync(
      pnpmEntrypoint!,
      ["demo", "--", "--source", markdown, "--output", outputRoot],
      { cwd: process.cwd() },
    );

    expect(stdout).toContain("Status: completed");
    const runDirectory = stdout.match(/^Run directory: (.+)$/m)?.[1];
    expect(runDirectory).toBeTruthy();
    const release = JSON.parse(await readFile(join(runDirectory, "release.json"), "utf8"));
    expect(release.version).toBe("v1.2.3");
    expect(release.features[0]?.title).toBe("Alpha");
  });
});
