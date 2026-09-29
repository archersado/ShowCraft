import { describe, expect, it } from "vitest";

import {
  releaseBriefSchema,
  renderManifestSchema,
  runRecordSchema,
  scenePlanSchema,
  runPipeline,
  RunStoreCore,
} from "./index.js";
import { mockPorts } from "./testing.js";
import type { PipelinePorts } from "./index.js";

/**
 * Cross-module end-to-end tests over the real pipeline: ports →
 * orchestrator → run store. Behavior lock only — public API and staged
 * bytes, no white-box inspection of internals.
 */

const FILE_NAMES = ["release.json", "scene.json", "manifest.json", "run.json"] as const;

function bytesOf(store: RunStoreCore, fileName: string): string {
  const file = store.collectFiles().find((f) => f.fileName === fileName);
  expect(file, `missing staged file ${fileName}`).toBeTruthy();
  return new TextDecoder().decode(file!.bytes);
}

describe("core end-to-end: success path", () => {
  it("stages the complete artifact set for a successful run", async () => {
    const store = new RunStoreCore("e2e-ok");
    await runPipeline(mockPorts(), store);

    expect(store.currentStatus).toBe("completed");
    expect(store.collectFiles().map((f) => f.fileName)).toEqual(FILE_NAMES);
  });

  it("produces artifacts that reverse-parse through the domain schemas", async () => {
    const store = new RunStoreCore("e2e-schema");
    await runPipeline(mockPorts(), store);

    expect(releaseBriefSchema.safeParse(JSON.parse(bytesOf(store, "release.json"))).success).toBe(
      true,
    );
    expect(scenePlanSchema.safeParse(JSON.parse(bytesOf(store, "scene.json"))).success).toBe(true);
    expect(renderManifestSchema.safeParse(JSON.parse(bytesOf(store, "manifest.json"))).success).toBe(
      true,
    );
    expect(runRecordSchema.safeParse(JSON.parse(bytesOf(store, "run.json"))).success).toBe(true);
  });

  it("is byte-stable for identical inputs", async () => {
    const first = new RunStoreCore("e2e-stable");
    await runPipeline(mockPorts(), first);
    const second = new RunStoreCore("e2e-stable");
    await runPipeline(mockPorts(), second);

    expect(first.collectFiles().map((f) => new TextDecoder().decode(f.bytes))).toEqual(
      second.collectFiles().map((f) => new TextDecoder().decode(f.bytes)),
    );
  });
});

describe("core end-to-end: per-provider failure injection", () => {
  function portsWithFailure(
    stage: "releaseSource" | "scenePlanner" | "renderer",
    message: string,
  ): PipelinePorts {
    const ports = mockPorts();
    ports[stage] = (() => {
      throw new Error(message);
    }) as PipelinePorts[typeof stage];
    return ports;
  }

  it("attributes release source failure and keeps only the run record", async () => {
    const store = new RunStoreCore("e2e-fail-source");
    await runPipeline(portsWithFailure("releaseSource", "chelog missing"), store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure).toMatchObject({ stage: "release", reason: /chelog missing/ });
    expect(store.collectFiles().map((f) => f.fileName)).toEqual(["run.json"]);
  });

  it("attributes scene planner failure and keeps the release artifact", async () => {
    const store = new RunStoreCore("e2e-fail-planner");
    await runPipeline(portsWithFailure("scenePlanner", "planner offline"), store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure).toMatchObject({ stage: "scenePlan", reason: /planner offline/ });
    const fileNames = store.collectFiles().map((f) => f.fileName);
    expect(fileNames).toContain("release.json");
    expect(fileNames).not.toContain("scene.json");
    expect(fileNames).not.toContain("manifest.json");
  });

  it("attributes renderer failure and keeps prior artifacts", async () => {
    const store = new RunStoreCore("e2e-fail-renderer");
    await runPipeline(portsWithFailure("renderer", "render outage"), store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure).toMatchObject({ stage: "manifest", reason: /render outage/ });
    const fileNames = store.collectFiles().map((f) => f.fileName);
    expect(fileNames).toEqual(["release.json", "scene.json", "run.json"]);
  });

  it("rejects an invalid release without staging it and fails at the release stage", async () => {
    const ports = mockPorts();
    ports.releaseSource = () => ({
      version: "v0.3.3",
      source: "mock://showcraft/demo-release",
      features: [],
    });
    const store = new RunStoreCore("e2e-invalid");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure).toMatchObject({ stage: "release" });
    expect(store.currentFailure?.reason).toContain("features");
    expect(store.collectFiles().map((f) => f.fileName)).toEqual(["run.json"]);
    const record = JSON.parse(bytesOf(store, "run.json"));
    expect(record.status).toBe("failed");
    expect(record.failure.reason).toContain("features");
  });
});
