import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDesktopReleaseFixture,
  cleanupDesktopFixtures,
  fakeRecorder,
  ownedPortCommand,
} from "./desktopFixtures.js";
import { runDemo } from "./main.js";

const outputPaths: string[] = [];

afterEach(async () => {
  await cleanupDesktopFixtures();
  await Promise.all(outputPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("buildDesktopReleaseFixture", () => {
  it("drives an eligible gate and byte-stable evidence across repeated source runs", async () => {
    const fixture = await buildDesktopReleaseFixture();
    const firstRoot = await mkdtemp(join(tmpdir(), "showcraft-desktop-fixture-a-"));
    const secondRoot = await mkdtemp(join(tmpdir(), "showcraft-desktop-fixture-b-"));
    outputPaths.push(firstRoot, secondRoot);

    const first = await runDemo({
      outputRoot: firstRoot,
      runId: "fixture-source",
      source: fixture.changelogPath,
    });
    const second = await runDemo({
      outputRoot: secondRoot,
      runId: "fixture-source",
      source: fixture.changelogPath,
    });

    const gate = JSON.parse(await readFile(join(first.runDirectory, "gate.json"), "utf8"));
    expect(gate.decisions).toContainEqual({
      featureId: "section-1-im",
      reason: "eligible",
      automatable: true,
      confidence: 1,
      evidenceIds: [expect.stringMatching(/^ev-section-1-im-[0-9a-f]{12}$/)],
    });
    for (const file of ["evidence.json", "gate.json"]) {
      const firstBytes = await readFile(join(first.runDirectory, file));
      const secondBytes = await readFile(join(second.runDirectory, file));
      expect(firstBytes.equals(secondBytes), file).toBe(true);
    }
  });

  it("rejects malformed command shapes instead of silently accepting them", async () => {
    await expect(ownedPortCommand("lsof", ["-tiTCP:3100"])).rejects.toThrow(
      /unexpected owned-port command/,
    );
    await expect(ownedPortCommand("unexpected", [])).rejects.toThrow(
      /unexpected owned-port command/,
    );
    await expect(
      fakeRecorder("success")("/usr/sbin/screencapture", ["-v", "-V", "1", "-D", "1"]),
    ).rejects.toThrow(/unexpected recorder arguments/);
  });
});
