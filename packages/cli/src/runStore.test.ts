import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RunStoreCore } from "@showcraft/core";
import { sampleManifest, sampleRelease } from "../../core/src/testing.js";

import { runDemo } from "./main.js";
import { createRunDirectory, persistRun, persistRunEvents } from "./runStore.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "showcraft-runstore-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createRunDirectory", () => {
  it("creates a unique run directory under the output root", async () => {
    const root = await makeTempRoot();
    const dir = await createRunDirectory(root, "run-a");
    expect(dir).toBe(join(root, "run-a"));
  });

  it("rejects creating a run directory that already exists", async () => {
    const root = await makeTempRoot();
    await createRunDirectory(root, "run-dup");
    await expect(createRunDirectory(root, "run-dup")).rejects.toThrow(/already exists/);
  });
});

describe("persistRun", () => {
  it("writes staged artifacts and the run record to disk", async () => {
    const root = await makeTempRoot();
    const store = new RunStoreCore("run-persist");
    store.recordArtifact({ stage: "release", value: sampleRelease });
    store.recordArtifact({ stage: "manifest", value: sampleManifest() });
    store.complete();

    const result = await persistRun(root, store);
    expect(result.status).toBe("completed");
    expect(result.files).toEqual(["release.json", "manifest.json", "run.json"]);

    const record = JSON.parse(await readFile(join(result.runDirectory, "run.json"), "utf8"));
    expect(record).toMatchObject({ runId: "run-persist", status: "completed" });
  });

  it("persists a failed run while keeping previously written artifacts", async () => {
    const root = await makeTempRoot();
    const runDirectory = await createRunDirectory(root, "run-fail");
    const store = new RunStoreCore("run-fail");
    store.recordArtifact({ stage: "release", value: sampleRelease });
    await persistRunEvents(runDirectory, store.collectFiles());

    store.fail("manifest", "boom");
    await persistRunEvents(runDirectory, [store.collectFiles().at(-1)!]);

    const kept = JSON.parse(await readFile(join(runDirectory, "release.json"), "utf8"));
    expect(kept.version).toBe(sampleRelease.version);
    const record = JSON.parse(await readFile(join(runDirectory, "run.json"), "utf8"));
    expect(record.status).toBe("failed");
    expect(record.failure).toEqual({ stage: "manifest", reason: "boom" });
  });
});

describe("runDemo through the run store", () => {
  it("writes the same three files with completed status", async () => {
    const root = await makeTempRoot();
    const result = await runDemo({ outputRoot: root, runId: "demo-fixed" });

    expect(result.status).toBe("completed");
    expect(result.runDirectory).toBe(join(root, "demo-fixed"));
    const release = JSON.parse(await readFile(join(result.runDirectory, "release.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(result.runDirectory, "manifest.json"), "utf8"));
    const run = JSON.parse(await readFile(join(result.runDirectory, "run.json"), "utf8"));
    expect(release.features).toHaveLength(1);
    expect(manifest.releaseVersion).toBe(release.version);
    expect(run).toMatchObject({
      format: "showcraft.mock-run/v1",
      runId: "demo-fixed",
      status: "completed",
    });
    expect(run.artifacts).toContain("release.json");
  });

  it("refuses to rerun into an existing run directory", async () => {
    const root = await makeTempRoot();
    await runDemo({ outputRoot: root, runId: "demo-again" });
    await expect(runDemo({ outputRoot: root, runId: "demo-again" })).rejects.toThrow(
      /already exists/,
    );
  });
});
