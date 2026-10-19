import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMockReleaseSource, createMockRenderer, createMockScenePlanner } from "@showcraft/core";
import { describe, expect, it, vi } from "vitest";

import { createRemotionRenderer, REMOTION_FPS } from "./remotionRender.js";
import { buildVolumeProps } from "./remotionComposition/volumeProps.js";

async function fixture() {
  const release = await createMockReleaseSource()();
  const plan = await createMockScenePlanner()(release);
  const manifest = await createMockRenderer()(release, plan);
  return { release, plan, manifest };
}

async function twoVolumeFixture() {
  const { manifest } = await fixture();
  const scenes = manifest.scenes.map((scene, index) => ({
    ...scene,
    id: `two-${index + 1}`,
    plannedDurationSeconds: index === 0 ? 1.25 : index === 1 ? 1.25 : 1.5,
  }));
  return {
    ...manifest,
    scenes,
    volumes: [
      { index: 1, sceneIds: scenes.slice(0, 2).map((scene) => scene.id), plannedTotalSeconds: 2.5 },
      { index: 2, sceneIds: scenes.slice(2).map((scene) => scene.id), plannedTotalSeconds: 1.5 },
    ],
  };
}

describe("buildVolumeProps", () => {
  it("maps scene timing and optional narration without re-estimating", async () => {
    const { release, plan, manifest } = await fixture();
    const narration = {
      releaseVersion: release.version,
      voice: "zh-CN-XiaoxiaoNeural",
      scenes: plan.scenes.map((scene) => ({
        sceneId: scene.id,
        featureId: scene.featureId,
        audioFile: `narration-${scene.id}.mp3`,
        audioDurationMs: 500,
        voice: "zh-CN-XiaoxiaoNeural",
        cues: [{ text: `${scene.title}。`, startMs: 0, endMs: 400 }],
      })),
    };
    const [props] = buildVolumeProps(manifest, narration, REMOTION_FPS);
    expect(props!.scenes.map((scene) => scene.startFrame)).toEqual([0, 360, 840]);
    expect(props!.scenes[0]!.audioFile).toBe("narration-scene-intro.mp3");
    expect(props!.scenes[0]!.subtitles[0]!.text).toContain("。");
  });

  it("rejects missing volumes and audio longer than its scene", async () => {
    const { release, plan, manifest } = await fixture();
    expect(() => buildVolumeProps({ ...manifest, volumes: undefined }, undefined, 30)).toThrow(/missing volumes/);
    expect(() => buildVolumeProps(manifest, {
      releaseVersion: release.version,
      voice: "v",
      scenes: [{
        sceneId: plan.scenes[0]!.id,
        featureId: plan.scenes[0]!.featureId,
        audioFile: "a.mp3",
        audioDurationMs: 99_999,
        voice: "v",
        cues: [{ text: "x", startMs: 0, endMs: 1 }],
      }],
    }, 30)).toThrow(/exceeds planned/);
    expect(() => buildVolumeProps(manifest, undefined, 0)).toThrow(/fps/);
    expect(() => buildVolumeProps(manifest, undefined, Number.NaN)).toThrow(/fps/);
  });

  it("uses cumulative frame boundaries that equal rounded volume duration", async () => {
    const manifest = await twoVolumeFixture();
    const [first] = buildVolumeProps(manifest, undefined, 29.97);
    expect(first!.scenes.map((scene) => [scene.startFrame, scene.durationInFrames])).toEqual([
      [0, 37], [37, 38],
    ]);
    expect(first!.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)).toBe(Math.round(2.5 * 29.97));
  });
});

describe("createRemotionRenderer", () => {
  it("renders every volume through injected browser-free dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-render-"));
    const { manifest } = await fixture();
    const renderMedia = vi.fn(async ({ outputLocation }: { outputLocation: string }) => {
      await writeFile(outputLocation, new Uint8Array([1, 2, 3]));
    });
    const renderer = createRemotionRenderer({
      bundle: vi.fn(async () => "serve-url"),
      selectComposition: vi.fn(async ({ inputProps }) => ({ durationInFrames: Math.round(inputProps.volume.totalSeconds * inputProps.fps) })),
      renderMedia,
    });
    const result = await renderer({ runId: "render-1", runDirectory: root, manifest });
    expect(result.volumes).toEqual([expect.objectContaining({
      index: 1,
      mp4File: "video-volume-1.mp4",
      durationSeconds: 40,
      sceneIds: manifest.volumes![0]!.sceneIds,
    })]);
    expect(renderMedia).toHaveBeenCalledOnce();
    expect(Array.from(await readFile(join(root, "video-volume-1.mp4")))).toEqual([1, 2, 3]);
  });

  it("records narration audio files from the same per-scene timing source", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-render-audio-"));
    const { release, plan, manifest } = await fixture();
    const narration = {
      releaseVersion: release.version,
      voice: "v",
      scenes: plan.scenes.map((scene) => ({
        sceneId: scene.id,
        featureId: scene.featureId,
        audioFile: `narration-${scene.id}.mp3`,
        audioDurationMs: 500,
        voice: "v",
        cues: [{ text: "字幕。", startMs: 0, endMs: 400 }],
      })),
    };
    const renderer = createRemotionRenderer({
      bundle: vi.fn(async () => "serve-url"),
      selectComposition: vi.fn(async () => ({})),
      renderMedia: vi.fn(async ({ outputLocation }) => { await writeFile(outputLocation, "mp4"); }),
    });
    const result = await renderer({ runId: "audio-run", runDirectory: root, manifest, narration });
    expect(result.volumes[0]!.audioFiles).toEqual(narration.scenes.map((scene) => scene.audioFile));
  });

  it("keeps diagnostics bounded and never promotes a partial MP4", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-render-fail-"));
    const { manifest } = await fixture();
    const renderer = createRemotionRenderer({
      bundle: vi.fn(async () => "serve-url"),
      selectComposition: vi.fn(async () => ({})),
      renderMedia: vi.fn(async ({ outputLocation }) => {
        await writeFile(outputLocation, new Uint8Array([1]));
        throw new Error(`Could not find browser executable ${"x".repeat(3_000)}`);
      }),
    });
    await expect(renderer({ runId: "render-fail", runDirectory: root, manifest })).rejects.toThrow(/browser ensure/);
    await expect(readFile(join(root, "video-volume-1.mp4"))).rejects.toThrow();
  });

  it("renders two volumes in order with exact output mappings", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-render-two-"));
    const manifest = await twoVolumeFixture();
    const outputs: string[] = [];
    const renderer = createRemotionRenderer({
      bundle: vi.fn(async () => "serve-url"),
      selectComposition: vi.fn(async () => ({})),
      renderMedia: vi.fn(async ({ outputLocation }) => {
        outputs.push(outputLocation);
        await writeFile(outputLocation, "mp4");
      }),
    });
    const result = await renderer({ runId: "two-run", runDirectory: root, manifest });
    expect(outputs.map((path) => path.slice(root.length + 1))).toEqual([
      "video-volume-1.mp4.partial.mp4", "video-volume-2.mp4.partial.mp4",
    ]);
    expect(result.volumes).toEqual([
      { index: 1, mp4File: "video-volume-1.mp4", durationSeconds: 2.5, sceneIds: manifest.volumes![0]!.sceneIds },
      { index: 2, mp4File: "video-volume-2.mp4", durationSeconds: 1.5, sceneIds: manifest.volumes![1]!.sceneIds },
    ]);
  });

  it("retains volume one and rejects the composition when volume two fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcraft-render-two-fail-"));
    const manifest = await twoVolumeFixture();
    let calls = 0;
    const renderer = createRemotionRenderer({
      bundle: vi.fn(async () => "serve-url"),
      selectComposition: vi.fn(async () => ({})),
      renderMedia: vi.fn(async ({ outputLocation }) => {
        calls += 1;
        await writeFile(outputLocation, "partial");
        if (calls === 2) throw new Error("volume two failed");
      }),
    });
    await expect(renderer({ runId: "two-fail", runDirectory: root, manifest })).rejects.toThrow(/volume two failed/);
    await expect(readFile(join(root, "video-volume-1.mp4"), "utf8")).resolves.toBe("partial");
    await expect(readFile(join(root, "video-volume-2.mp4"))).rejects.toThrow();
    await expect(readFile(join(root, "video-volume-2.mp4.partial.mp4"))).rejects.toThrow();
  });
});
