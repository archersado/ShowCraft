import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DemoActionRecord, DesktopDemoPort } from "@showcraft/core";

const desktopDemo = vi.hoisted(() => vi.fn<DesktopDemoPort>());

vi.mock("./desktopActions.js", () => ({
  createStartUpOSDemoActions: () => desktopDemo,
}));

import { runDemo } from "./main.js";

const SOURCE = "/Users/archersado/workspace/startupOS/docs/changes/releases/v0.3.3/changelog.md";
const temporaryPaths: string[] = [];

afterEach(async () => {
  desktopDemo.mockReset();
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function recordsFor(
  release: Parameters<DesktopDemoPort>[0],
  gate: Parameters<DesktopDemoPort>[1],
  failSupported = false,
): DemoActionRecord[] {
  return gate.decisions.map((decision) => {
    const sourceRef = release.features.find((feature) => feature.id === decision.featureId)!.sourceRef!;
    const base = { featureId: decision.featureId, sourceRef, evidenceIds: [...decision.evidenceIds] };
    if (decision.reason !== "eligible") {
      return { ...base, status: "skipped", reason: decision.reason };
    }
    if (decision.featureId !== "section-1-im") {
      return { ...base, status: "skipped", reason: "unsupported_feature" };
    }
    if (failSupported) {
      return {
        ...base,
        status: "failed",
        reason: "action_failed",
        diagnostics: "fixture failure",
      };
    }
    return {
      ...base,
      status: "executed",
      reason: "eligible",
      observations: {
        window_route_status: 200,
        management_api_status: 200,
        management_shape_valid: true,
        ask_user_candidate_present: true,
      },
    };
  });
}

describe.runIf(process.platform !== "win32")("runDemo desktop composition", () => {
  it("injects the desktop adapter and persists actions.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-compose-"));
    temporaryPaths.push(root);
    desktopDemo.mockImplementation((release, gate) => recordsFor(release, gate));

    const result = await runDemo({
      outputRoot: root,
      runId: "desktop-success",
      source: SOURCE,
      desktopRoot: "/unused-by-mock",
    });

    expect(desktopDemo).toHaveBeenCalledOnce();
    expect(await readdir(result.runDirectory)).toContain("actions.json");
  });

  it("persists actions and run diagnostics before rejecting a failed desktop stage", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-desktop-failure-"));
    temporaryPaths.push(root);
    desktopDemo.mockImplementation((release, gate) => recordsFor(release, gate, true));

    await expect(
      runDemo({
        outputRoot: root,
        runId: "desktop-failure",
        source: SOURCE,
        desktopRoot: "/unused-by-mock",
      }),
    ).rejects.toThrow(/failed at desktop/);

    const actions = JSON.parse(await readFile(join(root, "desktop-failure", "actions.json"), "utf8"));
    const run = JSON.parse(await readFile(join(root, "desktop-failure", "run.json"), "utf8"));
    expect(actions.actions.find((action: { featureId: string }) => action.featureId === "section-1-im"))
      .toMatchObject({ status: "failed", reason: "action_failed" });
    expect(run).toMatchObject({ status: "failed", failure: { stage: "desktop" } });
    expect(await readdir(join(root, "desktop-failure"))).not.toContain("scene.json");
    expect(await readdir(join(root, "desktop-failure"))).not.toContain("manifest.json");
  });
});
