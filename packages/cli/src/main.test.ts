import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";
import { NarrationError } from "@showcraft/core";

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

  it("assembles an opt-in narration port without changing the default path", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-tts-"));
    temporaryPaths.push(root);
    const result = await runDemo({
      outputRoot: root,
      runId: "tts-run",
      tts: true,
      voice: "en-US-EmmaMultilingualNeural",
      createNarration: (runDirectory, voice) => async (release, scenePlan) => {
        await writeFile(join(runDirectory, "narration-scene-mock-feature.mp3"), new Uint8Array([0xff, 0xf3]));
        return {
          releaseVersion: release.version,
          voice: voice!,
          scenes: scenePlan.scenes.map((scene) => ({
            sceneId: scene.id,
            featureId: scene.featureId,
            audioFile: `narration-${scene.id}.mp3`,
            audioDurationMs: 1,
            voice: voice!,
            cues: [{ text: scene.narration, startMs: 0, endMs: 1 }],
          })),
        };
      },
    });

    expect(await readdir(result.runDirectory)).toEqual([
      "manifest.json",
      "narration-scene-mock-feature.mp3",
      "narration.json",
      "release.json",
      "run.json",
      "scene.json",
    ]);
  });

  it("rejects a programmatic voice override when TTS is disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-voice-"));
    temporaryPaths.push(root);
    await expect(runDemo({ outputRoot: root, runId: "bad-voice", voice: "custom" })).rejects.toThrow(
      /--voice requires --tts/,
    );
  });

  it("persists a bounded phase-bearing narration failure reason", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-tts-failure-"));
    temporaryPaths.push(root);
    await expect(runDemo({
      outputRoot: root,
      runId: "tts-failure",
      tts: true,
      createNarration: () => () => {
        throw new NarrationError("handshake", "service rejected", "service rejected");
      },
    })).rejects.toThrow(/handshake/);

    const run = JSON.parse(await readFile(join(root, "tts-failure", "run.json"), "utf8"));
    expect(run.failure).toMatchObject({ stage: "narration" });
    expect(run.failure.reason).toContain("[handshake]");
    expect(run.failure.reason.length).toBeLessThanOrEqual(2_048);
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

  it("accepts --desktop only together with --source", () => {
    expect(parseDemoArgs(["--source", "release.md", "--desktop", "/startupos"])).toEqual({
      source: "release.md",
      desktopRoot: "/startupos",
    });
    expect(() => parseDemoArgs(["--desktop", "/startupos"])).toThrow(/requires --source/);
  });

  it("accepts --tts with an optional voice and rejects a voice alone", () => {
    expect(parseDemoArgs(["--tts"])).toEqual({ tts: true });
    expect(parseDemoArgs(["--tts", "--voice", "en-US-EmmaMultilingualNeural"])).toEqual({
      tts: true,
      voice: "en-US-EmmaMultilingualNeural",
    });
    expect(() => parseDemoArgs(["--voice", "en-US-EmmaMultilingualNeural"])).toThrow(
      /--voice requires --tts/,
    );
    expect(() => parseDemoArgs(["--tts", "--voice", "--source", "release.md"])).toThrow(/Usage:/);
  });

  it("rejects programmatic desktop runs without a source before creating output", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-cli-desktop-usage-"));
    temporaryPaths.push(root);
    await expect(
      runDemo({ outputRoot: root, runId: "invalid-desktop", desktopRoot: "/startupos" }),
    ).rejects.toThrow(/requires --source/);
    await expect(stat(join(root, "invalid-desktop"))).rejects.toThrow();
  });
});

describe("pnpm demo", () => {
  it("runs the root command and reports a completed run", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "showcraft-cli-command-"));
    temporaryPaths.push(outputRoot);
    // npm_execpath points at the package-manager JS entry only when vitest
    // is launched THROUGH that package manager — npm sets npm-cli.js, whose
    // `demo` command does not exist. Run the pnpm entrypoint explicitly and
    // skip gracefully when no JS entrypoint exists in this environment.
    const nodeLibDir = join(dirname(dirname(process.execPath)), "lib", "node_modules");
    const pnpmEntrypoint = join(nodeLibDir, "corepack", "dist", "pnpm.js");
    if (
      !(await stat(pnpmEntrypoint).then(() => true).catch(() => false)) &&
      !(process.env.npm_execpath?.endsWith(".js") ?? false)
    ) {
      return;
    }
    const entry = (await stat(pnpmEntrypoint).then(() => true).catch(() => false))
      ? pnpmEntrypoint
      : process.env.npm_execpath!;
    const { stdout } = await execFileAsync(process.execPath, [entry, "demo", "--", "--output", outputRoot], {
      cwd: process.cwd(),
    });
    const runDirectory = stdout.match(/^Run directory: (.+)$/m)?.[1];

    expect(runDirectory).toBeTruthy();
    expect(stdout).toContain("Status: completed");
    await expect(readFile(join(runDirectory!, "run.json"), "utf8")).resolves.toContain('"completed"');
  });
});
