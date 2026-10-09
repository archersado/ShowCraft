import { describe, expect, it } from "vitest";

import { runPipeline } from "./orchestrator.js";
import { RunStoreCore } from "./runStore.js";
import { mockPorts } from "./testing.js";

describe("runPipeline", () => {
  it("completes all stages with mock providers", async () => {
    const store = new RunStoreCore("orch-ok");
    await runPipeline(mockPorts(), store);

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual(["release.json", "scene.json", "manifest.json", "run.json"]);
  });

  it("records failure stage and keeps prior artifacts when the renderer throws", async () => {
    const ports = mockPorts();
    ports.renderer = () => {
      throw new Error("renderer exploded");
    };
    const store = new RunStoreCore("orch-render-fail");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("manifest");
    expect(store.currentFailure?.reason).toContain("renderer exploded");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toContain("release.json");
    expect(files).toContain("scene.json");
    expect(files).not.toContain("manifest.json");
    const record = JSON.parse(
      new TextDecoder().decode(store.collectFiles().find((f) => f.fileName === "run.json")?.bytes),
    );
    expect(record.status).toBe("failed");
  });

  it("records failure at release stage when the source throws first", async () => {
    const ports = mockPorts();
    ports.releaseSource = () => {
      throw new Error("no changelog");
    };
    const store = new RunStoreCore("orch-source-fail");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("release");
    expect(store.collectFiles().map((file) => file.fileName)).toEqual(["run.json"]);
  });

  it("fails at the planner stage when the planner throws after a good release", async () => {
    const ports = mockPorts();
    ports.scenePlanner = () => {
      throw new Error("planner offline");
    };
    const store = new RunStoreCore("orch-planner-fail");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("scenePlan");
    expect(store.collectFiles().map((file) => file.fileName)).toEqual(["release.json", "run.json"]);
  });

  it("rejects invalid provider output via schema instead of accepting it", async () => {
    const ports = mockPorts();
    ports.releaseSource = () => ({
      version: "v0.3.3",
      source: "mock://showcraft/demo-release",
      features: [],
    });
    const store = new RunStoreCore("orch-invalid");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("release");
    expect(store.currentFailure?.reason).toContain("features");
  });

  it("skips the evidence stage entirely when no codeEvidence port is provided", async () => {
    const store = new RunStoreCore("orch-no-evidence");
    await runPipeline(mockPorts(), store);

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual(["release.json", "scene.json", "manifest.json", "run.json"]);
    expect(files).not.toContain("evidence.json");
  });

  it("records the evidence artifact between release and scenePlan when the port is provided", async () => {
    const ports = mockPorts();
    ports.codeEvidence = (release) => ({
      pack: {
        releaseVersion: release.version,
        entries: [
          {
            id: "ev-1",
            featureId: release.features[0]!.id,
            kind: "commit",
            reference: { location: "a".repeat(40) },
            confidence: 0.5,
          },
        ],
      },
      entryPoints: [
        {
          id: `entry-${release.features[0]!.id}`,
          featureId: release.features[0]!.id,
          description: "入口候选",
          confidence: 0.5,
          evidenceIds: ["ev-1"],
        },
      ],
    });
    const store = new RunStoreCore("orch-evidence");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual([
      "release.json",
      "evidence.json",
      "scene.json",
      "manifest.json",
      "run.json",
    ]);
  });

  it("skips the gate stage when no confidenceGate port is provided even with evidence", async () => {
    const ports = mockPorts();
    ports.codeEvidence = (release) => ({
      pack: { releaseVersion: release.version, entries: [] },
      entryPoints: [],
    });
    const store = new RunStoreCore("orch-no-gate");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual([
      "release.json",
      "evidence.json",
      "scene.json",
      "manifest.json",
      "run.json",
    ]);
    expect(files).not.toContain("gate.json");
  });

  it("records the gate artifact between evidence and scenePlan when the port is provided", async () => {
    const ports = mockPorts();
    const featureId = "mock-feature";
    ports.codeEvidence = (release) => ({
      pack: {
        releaseVersion: release.version,
        entries: [
          {
            id: "ev-1",
            featureId: release.features[0]!.id,
            kind: "commit",
            reference: { location: "a".repeat(40) },
            confidence: 0.9,
          },
        ],
      },
      entryPoints: [
        {
          id: `entry-${featureId}`,
          featureId,
          description: "入口候选",
          confidence: 0.9,
          evidenceIds: ["ev-1"],
        },
      ],
    });
    ports.confidenceGate = (release, evidence) => ({
      releaseVersion: release.version,
      threshold: 0.8,
      decisions: release.features.map((feature) => {
        const candidate = evidence.entryPoints.find((c) => c.featureId === feature.id);
        if (!candidate || candidate.confidence < 0.8) {
          return { featureId: feature.id, reason: "no_evidence", automatable: false, evidenceIds: [] };
        }
        return {
          featureId: feature.id,
          reason: "eligible",
          automatable: true,
          confidence: candidate.confidence,
          evidenceIds: [...candidate.evidenceIds],
        };
      }),
    });
    const store = new RunStoreCore("orch-gate");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("completed");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual([
      "release.json",
      "evidence.json",
      "gate.json",
      "scene.json",
      "manifest.json",
      "run.json",
    ]);
    const record = JSON.parse(
      new TextDecoder().decode(store.collectFiles().find((f) => f.fileName === "run.json")?.bytes),
    );
    expect(record.artifacts).toEqual([
      "release.json",
      "evidence.json",
      "gate.json",
      "scene.json",
      "manifest.json",
    ]);
  });

  it("passes the gated feature set to the scene planner", async () => {
    const ports = mockPorts();
    ports.codeEvidence = (release) => ({
      pack: { releaseVersion: release.version, entries: [] },
      entryPoints: [],
    });
    ports.confidenceGate = (release) => ({
      releaseVersion: release.version,
      threshold: 0.8,
      decisions: release.features.map((feature) => ({
        featureId: feature.id,
        reason: "no_evidence" as const,
        automatable: false,
        evidenceIds: [],
      })),
    });
    let receivedContext: unknown;
    ports.scenePlanner = (release, context) => {
      receivedContext = context;
      return {
        releaseVersion: release.version,
        scenes: release.features.map((feature) => ({
          id: `scene-${feature.id}`,
          featureId: feature.id,
          title: feature.title,
          narration: feature.narration,
          narrationSource: "narration" as const,
          plannedDurationSeconds: 15,
        })),
      };
    };
    const store = new RunStoreCore("orch-gate-context");
    await runPipeline(ports, store);

    expect(receivedContext).toMatchObject({
      gatedFeatureIds: new Set(["mock-feature"]),
    });
  });

  it("attributes a gate port failure to the gate stage, keeping release and evidence artifacts", async () => {
    const ports = mockPorts();
    ports.codeEvidence = (release) => ({
      pack: { releaseVersion: release.version, entries: [] },
      entryPoints: [],
    });
    ports.confidenceGate = () => {
      throw new Error("gate exploded");
    };
    const store = new RunStoreCore("orch-gate-fail");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("gate");
    expect(store.currentFailure?.reason).toContain("gate exploded");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual(["release.json", "evidence.json", "run.json"]);
  });

  it("rejects gate output failing its schema via stage failure", async () => {
    const ports = mockPorts();
    ports.codeEvidence = (release) => ({
      pack: { releaseVersion: release.version, entries: [] },
      entryPoints: [],
    });
    ports.confidenceGate = () => ({
      releaseVersion: "",
      threshold: 0.8,
      decisions: [],
    });
    const store = new RunStoreCore("orch-gate-invalid");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("gate");
    expect(store.currentFailure?.reason).toContain("releaseVersion");
  });

  it("attributes an evidence port failure to the evidence stage, keeping release artifacts", async () => {
    const ports = mockPorts();
    ports.codeEvidence = () => {
      throw new Error("git repo corrupted");
    };
    const store = new RunStoreCore("orch-evidence-fail");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("evidence");
    expect(store.currentFailure?.reason).toContain("git repo corrupted");
    const files = store.collectFiles().map((file) => file.fileName);
    expect(files).toEqual(["release.json", "run.json"]);
  });

  it("rejects evidence output failing its schema via stage failure", async () => {
    const ports = mockPorts();
    ports.codeEvidence = () => ({
      pack: { releaseVersion: "", entries: [] },
      entryPoints: [],
    });
    const store = new RunStoreCore("orch-evidence-invalid");
    await runPipeline(ports, store);

    expect(store.currentStatus).toBe("failed");
    expect(store.currentFailure?.stage).toBe("evidence");
    // Cross-artifact version consistency stays with validateReleasePackageRelations.
  });

  it("accepts fully custom fake providers without core changes", async () => {
    const ports: PipelinePorts = {
      releaseSource: () => ({
        version: "v9.9.9",
        source: "fake://source",
        features: [{ id: "f1", title: "T", narration: "N" }],
      }),
      scenePlanner: (release) => ({
        releaseVersion: release.version,
        scenes: release.features.map((feature) => ({
          id: `s-${feature.id}`,
          featureId: feature.id,
          title: feature.title,
          narration: feature.narration,
          narrationSource: "narration" as const,
          plannedDurationSeconds: 5,
        })),
      }),
      renderer: (release, scenePlan) => ({
        format: "showcraft.mock-manifest/v1",
        releaseVersion: release.version,
        scenes: scenePlan.scenes,
      }),
    };
    const store = new RunStoreCore("orch-custom");
    await runPipeline(ports, store);
    expect(store.currentStatus).toBe("completed");
    expect(store.collectFiles().map((file) => file.fileName)).toEqual([
      "release.json",
      "scene.json",
      "manifest.json",
      "run.json",
    ]);
  });
});
