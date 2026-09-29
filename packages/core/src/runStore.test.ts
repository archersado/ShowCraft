import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  IllegalRunTransitionError,
  RunStoreCore,
  runStageOrder,
  stageFileNames,
} from "./runStore.js";
import {
  sampleManifest,
  sampleRelease as release,
  sampleScenePlan,
} from "./testing.js";

const scenePlan = sampleScenePlan(release);
const manifest = sampleManifest(release, scenePlan);

describe("RunStoreCore", () => {
  it("stages schema-validated artifacts and completes a run", () => {
    const store = new RunStoreCore("run-ok");
    for (const stage of runStageOrder) {
      const artifact =
        stage === "release" ? release : stage === "scenePlan" ? scenePlan : manifest;
      store.recordArtifact({ stage, value: artifact });
    }
    store.complete();

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles();
    expect(files.map((file) => file.fileName)).toEqual([
      "release.json",
      "scene.json",
      "manifest.json",
      "run.json",
    ]);
    const record = JSON.parse(new TextDecoder().decode(files[3]?.bytes));
    expect(record).toMatchObject({ runId: "run-ok", status: "completed" });
    expect(record.artifacts).toEqual(["release.json", "scene.json", "manifest.json"]);
  });

  it("rejects artifacts that fail their schema without staging anything", () => {
    const store = new RunStoreCore("run-bad");
    const broken = { ...release, features: [] };
    expect(() => store.recordArtifact({ stage: "release", value: broken })).toThrow(
      DomainValidationError,
    );
    expect(store.collectFiles().some((file) => file.fileName === "release.json")).toBe(false);
  });

  it("keeps prior staged artifacts when a later stage fails", () => {
    const store = new RunStoreCore("run-fail");
    store.recordArtifact({ stage: "release", value: release });
    store.recordArtifact({ stage: "scenePlan", value: scenePlan });
    store.fail("manifest", "renderer unavailable");

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure).toEqual({ stage: "manifest", reason: "renderer unavailable" });
    const files = store.collectFiles();
    expect(files.map((file) => file.fileName)).toEqual([
      "release.json",
      "scene.json",
      "run.json",
    ]);
    const record = JSON.parse(new TextDecoder().decode(files[2]?.bytes));
    expect(record.status).toBe("failed");
    expect(record.failure).toEqual({ stage: "manifest", reason: "renderer unavailable" });
  });

  it("rejects illegal transitions and keeps the run status unchanged", () => {
    const store = new RunStoreCore("run-illegal");
    expect(() => store.transition("completed")).toThrow(IllegalRunTransitionError);
    expect(store.currentStatus).toBe("pending");

    store.transition("running");
    store.transition("completed");
    expect(() => store.transition("running")).toThrow(IllegalRunTransitionError);
    expect(() => store.transition("failed")).toThrow(IllegalRunTransitionError);
    expect(store.currentStatus).toBe("completed");
  });

  it("rejects empty run ids", () => {
    expect(() => new RunStoreCore("")).toThrow();
    expect(() => new RunStoreCore("  ")).toThrow();
  });

  it("produces byte-identical run records for identical runs", () => {
    const build = () => {
      const store = new RunStoreCore("run-bytes");
      store.recordArtifact({ stage: "release", value: release });
      store.complete();
      return store.collectFiles().find((file) => file.fileName === "run.json")?.bytes;
    };
    expect(new TextDecoder().decode(build())).toBe(new TextDecoder().decode(build()));
  });

  it("exposes stable stage ordering and file names", () => {
    expect(runStageOrder).toEqual(["release", "scenePlan", "manifest"]);
    expect(stageFileNames.release).toBe("release.json");
  });
});
