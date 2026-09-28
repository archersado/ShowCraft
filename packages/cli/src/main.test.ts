import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("runDemo", () => {
  it("writes inspectable artifacts to the default run root", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "showcraft-cli-default-"));
    temporaryPaths.push(cwd);

    const result = await runDemo({ cwd, runId: "test-run" });

    expect(result).toEqual({ runDirectory: join(cwd, "runs", "test-run"), status: "completed" });
    const release = JSON.parse(await readFile(join(result.runDirectory, "release.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(result.runDirectory, "manifest.json"), "utf8"));
    const run = JSON.parse(await readFile(join(result.runDirectory, "run.json"), "utf8"));

    expect(release.version).toBe("demo");
    expect(manifest).toMatchObject({ format: "showcraft.mock-manifest/v1", releaseVersion: release.version });
    expect(run).toMatchObject({ format: "showcraft.mock-run/v1", status: "completed" });
  });

  it("uses a caller-supplied output root", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-output-"));
    temporaryPaths.push(root);

    const result = await runDemo({ outputRoot: root, runId: "custom-run" });

    expect(result.runDirectory).toBe(join(root, "custom-run"));
    await expect(readFile(join(result.runDirectory, "run.json"), "utf8")).resolves.toBeTruthy();
  });

  it("reports a readable error when the output root is a file", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-error-"));
    temporaryPaths.push(root);
    const blockedPath = join(root, "not-a-directory");
    await writeFile(blockedPath, "blocked", "utf8");

    await expect(runDemo({ outputRoot: blockedPath, runId: "cannot-write" })).rejects.toThrow(
      /Unable to create run directory/,
    );
  });

  it("does not reuse an existing run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-collision-"));
    temporaryPaths.push(root);
    await runDemo({ outputRoot: root, runId: "existing-run" });

    await expect(runDemo({ outputRoot: root, runId: "existing-run" })).rejects.toThrow(
      /already exists/,
    );
  });

  it("rejects run IDs that escape the output root", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-run-id-"));
    temporaryPaths.push(root);

    await expect(runDemo({ outputRoot: root, runId: "../escape" })).rejects.toThrow(/Invalid run ID/);
  });
});

describe("parseDemoArgs", () => {
  it("accepts an optional output directory", () => {
    expect(parseDemoArgs(["--output", "custom-runs"])).toEqual({ outputRoot: "custom-runs" });
    expect(parseDemoArgs(["--", "--output", "custom-runs"])).toEqual({ outputRoot: "custom-runs" });
  });

  it("rejects unsupported arguments", () => {
    expect(() => parseDemoArgs(["--unknown"])).toThrow(/Usage:/);
  });
});

describe("pnpm demo", () => {
  it("runs the root command and reports a completed run", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "showcraft-cli-command-"));
    temporaryPaths.push(outputRoot);
    const pnpmEntrypoint = process.env.npm_execpath;

    expect(pnpmEntrypoint).toBeTruthy();
    const { stdout } = await execFileAsync(pnpmEntrypoint!, ["demo", "--", "--output", outputRoot], {
      cwd: process.cwd(),
    });
    const runDirectory = stdout.match(/^Run directory: (.+)$/m)?.[1];

    expect(runDirectory).toBeTruthy();
    expect(stdout).toContain("Status: completed");
    await expect(readFile(join(runDirectory!, "run.json"), "utf8")).resolves.toContain('"completed"');
  });
});
