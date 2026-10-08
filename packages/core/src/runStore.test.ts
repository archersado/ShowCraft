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
import type { EvidencePack } from "./domain.js";

const scenePlan = sampleScenePlan(release);
const manifest = sampleManifest(release, scenePlan);

const evidencePack: EvidencePack = { releaseVersion: release.version, entries: [] };

describe("RunStoreCore", () => {
  it("stages schema-validated artifacts and completes a run", () => {
    const store = new RunStoreCore("run-ok");
    for (const stage of ["release", "evidence", "scenePlan", "manifest"] as const) {
      const artifact =
        stage === "release"
          ? release
          : stage === "evidence"
            ? { pack: evidencePack, entryPoints: [] }
            : stage === "scenePlan"
              ? scenePlan
              : manifest;
      store.recordArtifact({ stage, value: artifact });
    }
    store.complete();

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles();
    expect(files.map((file) => file.fileName)).toEqual([
      "release.json",
      "evidence.json",
      "scene.json",
      "manifest.json",
      "run.json",
    ]);
    const record = JSON.parse(new TextDecoder().decode(files[4]?.bytes));
    expect(record).toMatchObject({ runId: "run-ok", status: "completed" });
    expect(record.artifacts).toEqual([
      "release.json",
      "evidence.json",
      "scene.json",
      "manifest.json",
    ]);
  });

  it("stages evidence packs with entry points into a single evidence.json", () => {
    const store = new RunStoreCore("run-evidence");
    const event = store.recordArtifact({
      stage: "evidence",
      value: {
        pack: {
          releaseVersion: "v0.3.3",
          entries: [
            {
              id: "ev-1",
              featureId: "f1",
              kind: "commit",
              reference: { location: "a".repeat(40) },
              confidence: 0.5,
            },
          ],
        },
        entryPoints: [
          {
            id: "entry-f1",
            featureId: "f1",
            description: "入口",
            confidence: 0.5,
            evidenceIds: ["ev-1"],
          },
        ],
      },
    });

    expect(event.file.fileName).toBe("evidence.json");
    const parsed = JSON.parse(new TextDecoder().decode(event.file.bytes));
    expect(parsed.releaseVersion).toBe("v0.3.3");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entryPoints).toHaveLength(1);
  });

  it("rejects evidence artifacts that fail their schema without staging anything", () => {
    const store = new RunStoreCore("run-bad-evidence");
    expect(() =>
      store.recordArtifact({
        stage: "evidence",
        value: {
          pack: { releaseVersion: "", entries: [] },
          entryPoints: [],
        },
      }),
    ).toThrow(DomainValidationError);
    expect(store.collectFiles().some((file) => file.fileName === "evidence.json")).toBe(false);
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
    expect(runStageOrder).toEqual(["release", "evidence", "scenePlan", "manifest"]);
    expect(stageFileNames.release).toBe("release.json");
    expect(stageFileNames.evidence).toBe("evidence.json");
  });
});
