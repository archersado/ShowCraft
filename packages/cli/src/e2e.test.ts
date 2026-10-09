import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  releaseBriefSchema,
  renderManifestSchema,
  runPipeline,
  runRecordSchema,
  RunStoreCore,
  scenePlanSchema,
} from "@showcraft/core";
import { mockPorts } from "../../core/src/testing.js";

import { runDemo } from "./main.js";
import { createRunDirectory, persistRunEvents } from "./runStore.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "showcraft-e2e-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const FILE_NAMES = ["manifest.json", "release.json", "run.json", "scene.json"].sort();

describe("CLI end-to-end: successful run on disk", () => {
  it("writes the complete artifact set and every file reverse-parses", async () => {
    const root = await makeTempRoot();
    const result = await runDemo({ outputRoot: root, runId: "e2e-disk-ok" });

    expect(result.status).toBe("completed");
    expect((await readdir(result.runDirectory)).sort()).toEqual(FILE_NAMES);

    const parsed = {
      release: releaseBriefSchema.safeParse(
        JSON.parse(await readFile(join(result.runDirectory, "release.json"), "utf8")),
      ),
      scene: scenePlanSchema.safeParse(
        JSON.parse(await readFile(join(result.runDirectory, "scene.json"), "utf8")),
      ),
      manifest: renderManifestSchema.safeParse(
        JSON.parse(await readFile(join(result.runDirectory, "manifest.json"), "utf8")),
      ),
      run: runRecordSchema.safeParse(
        JSON.parse(await readFile(join(result.runDirectory, "run.json"), "utf8")),
      ),
    };
    expect(parsed.release.success).toBe(true);
    expect(parsed.scene.success).toBe(true);
    expect(parsed.manifest.success).toBe(true);
    expect(parsed.run.success).toBe(true);
  });

  it("is byte-stable across identical runs", async () => {
    const firstRoot = await makeTempRoot();
    const first = await runDemo({ outputRoot: firstRoot, runId: "e2e-bytes" });
    const secondRoot = await makeTempRoot();
    await runDemo({ outputRoot: secondRoot, runId: "e2e-bytes" });
    const secondDir = join(secondRoot, "e2e-bytes");

    for (const fileName of FILE_NAMES) {
      const a = await readFile(join(first.runDirectory, fileName));
      const b = await readFile(join(secondDir, fileName));
      expect(Buffer.from(a).equals(Buffer.from(b)), fileName).toBe(true);
    }
  });

  it("always lands a run.json even when the pipeline fails mid-way", async () => {
    const root = await makeTempRoot();
    const runDirectory = await createRunDirectory(root, "e2e-disk-fail");
    const store = new RunStoreCore("e2e-disk-fail");
    const ports = mockPorts();
    ports.renderer = () => {
      throw new Error("disk render outage");
    };
    await runPipeline(ports, store);
    await persistRunEvents(runDirectory, store.collectFiles());

    const files = (await readdir(runDirectory)).sort();
    expect(files).toEqual(["release.json", "run.json", "scene.json"]);
    const record = JSON.parse(await readFile(join(runDirectory, "run.json"), "utf8"));
    expect(record.status).toBe("failed");
    expect(record.failure).toMatchObject({ stage: "manifest", reason: /disk render outage/ });
    // Prior artifacts survive on disk, not just in memory.
    await expect(readFile(join(runDirectory, "release.json"), "utf8")).resolves.toContain("demo");
  });
});

describe("CLI end-to-end: demo entry point regression", () => {
  it("runDemo keeps producing the same artifact set", async () => {
    const root = await makeTempRoot();
    const result = await runDemo({ outputRoot: root, runId: "e2e-demo" });

    expect((await readdir(result.runDirectory)).sort()).toEqual(FILE_NAMES);
    const run = JSON.parse(await readFile(join(result.runDirectory, "run.json"), "utf8"));
    expect(run).toMatchObject({ runId: "e2e-demo", status: "completed" });
    expect(run.artifacts).toEqual(["release.json", "scene.json", "manifest.json"]);
  });

  it("keeps mock runs at the 4-file set with no gate.json", async () => {
    const root = await makeTempRoot();
    const result = await runDemo({ outputRoot: root, runId: "e2e-no-gate" });

    const files = (await readdir(result.runDirectory)).sort();
    expect(files).toEqual(FILE_NAMES);
    expect(files).not.toContain("gate.json");
    expect(files).not.toContain("evidence.json");
  });
});
