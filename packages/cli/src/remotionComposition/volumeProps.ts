import type { NarrationArtifact, RenderManifest, Scene, SubtitleCue } from "@showcraft/core";

import { groupSubtitleCues, type SubtitleGroup } from "./subtitleGrouping.js";

export type VolumeSceneProps = {
  id: string;
  featureId: string;
  title: string;
  narration: string;
  durationSeconds: number;
  startFrame: number;
  durationInFrames: number;
  audioFile?: string;
  cues: readonly SubtitleCue[];
  subtitles: readonly SubtitleGroup[];
};

export type VolumeInputProps = {
  volume: { index: number; totalSeconds: number };
  fps: number;
  scenes: readonly VolumeSceneProps[];
};

export function buildVolumeProps(
  manifest: RenderManifest,
  narration: NarrationArtifact | undefined,
  fps: number,
): VolumeInputProps[] {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error("fps must be a positive finite number");
  if (!manifest.volumes?.length) {
    throw new Error("manifest is missing volumes; per-volume rendering is unavailable");
  }
  const scenes = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
  const narrated = new Map(narration?.scenes.map((scene) => [scene.sceneId, scene]) ?? []);
  return manifest.volumes.map((volume) => {
    let elapsedSeconds = 0;
    const volumeScenes = volume.sceneIds.map((sceneId): VolumeSceneProps => {
      const scene = scenes.get(sceneId);
      if (!scene) throw new Error(`volume ${volume.index} references unknown scene ${sceneId}`);
      const audio = narrated.get(sceneId);
      if (audio && audio.audioDurationMs > scene.plannedDurationSeconds * 1_000) {
        throw new Error(
          `scene ${sceneId} audio ${audio.audioDurationMs} ms exceeds planned ${scene.plannedDurationSeconds} s`,
        );
      }
      const startFrame = Math.round(elapsedSeconds * fps);
      elapsedSeconds += scene.plannedDurationSeconds;
      const durationInFrames = Math.round(elapsedSeconds * fps) - startFrame;
      const mapped = mapScene(scene, startFrame, durationInFrames, audio);
      return mapped;
    });
    return {
      volume: { index: volume.index, totalSeconds: volume.plannedTotalSeconds },
      fps,
      scenes: volumeScenes,
    };
  });
}

function mapScene(
  scene: Scene,
  startFrame: number,
  durationInFrames: number,
  audio: NarrationArtifact["scenes"][number] | undefined,
): VolumeSceneProps {
  return {
    id: scene.id,
    featureId: scene.featureId,
    title: scene.title,
    narration: scene.narration,
    durationSeconds: scene.plannedDurationSeconds,
    startFrame,
    durationInFrames,
    ...(audio ? { audioFile: audio.audioFile } : {}),
    cues: audio?.cues ?? [],
    subtitles: groupSubtitleCues(audio?.cues ?? []),
  };
}
