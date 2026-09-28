import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMockReleaseSource,
  createMockScenePlanner,
  RunStoreCore,
  runPipeline,
} from "@showcraft/core";

import { runDemo } from "./main.js";
import { createRunDirectory, persistRunEvents } from "./runStore.js";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "showcraft-orch-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("orchestrated CLI persistence", () => {
  it("persists a failed pipeline while keeping earlier stage files", async () => {
    const root = await makeTempRoot();
    const runDirectory = await createRunDirectory(root, "orch-cli-fail");

    const store = new RunStoreCore("orch-cli-fail");
    await runPipeline(
      {
        releaseSource: createMockReleaseSource(),
        scenePlanner: createMockScenePlanner(),
        renderer: () => {
          throw new Error("mock render outage");
        },
      },
      store,
    );
    expect(store.currentStatus).toBe("failed");
    await persistRunEvents(runDirectory, store.collectFiles());

    const release = JSON.parse(await readFile(join(runDirectory, "release.json"), "utf8"));
    expect(release.version).toBe("demo");
    const record = JSON.parse(await readFile(join(runDirectory, "run.json"), "utf8"));
    expect(record.status).toBe("failed");
    expect(record.failure).toMatchObject({ stage: "manifest" });
    await expect(readFile(join(runDirectory, "manifest.json"), "utf8")).rejects.toThrow();
  });

  it("runDemo still produces the same four files via the orchestrator", async () => {
    const root = await makeTempRoot();
    const result = await runDemo({ outputRoot: root, runId: "demo-orch" });

    expect(result.status).toBe("completed");
    const record = JSON.parse(await readFile(join(result.runDirectory, "run.json"), "utf8"));
    expect(record).toMatchObject({ runId: "demo-orch", status: "completed" });
    expect(record.artifacts).toEqual(["release.json", "scene.json", "manifest.json"]);
  });
});
