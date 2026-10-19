import { rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CompositionPort } from "@showcraft/core";

import { buildVolumeProps, type VolumeInputProps } from "./remotionComposition/volumeProps.js";

export const REMOTION_FPS = 30;
export const REMOTION_WIDTH = 1280;
export const REMOTION_HEIGHT = 720;
const COMPOSITION_ID = "showcraft-volume";

type RenderDependencies = {
  bundle: (options: { entryPoint: string; publicDir: string }) => Promise<string>;
  selectComposition: (options: { serveUrl: string; id: string; inputProps: VolumeInputProps }) => Promise<unknown>;
  renderMedia: (options: {
    composition: unknown;
    serveUrl: string;
    codec: "h264";
    outputLocation: string;
    inputProps: VolumeInputProps;
  }) => Promise<void>;
};

export function createRemotionRenderer(dependencies?: Partial<RenderDependencies>): CompositionPort {
  return async ({ runId, runDirectory, manifest, narration }) => {
    try {
      const propsByVolume = buildVolumeProps(manifest, narration, REMOTION_FPS);
      const deps = await resolveDependencies(dependencies);
      const serveUrl = await deps.bundle({
        entryPoint: fileURLToPath(new URL("./remotionComposition/Root.tsx", import.meta.url)),
        publicDir: runDirectory,
      });

      const volumes = [];
      for (const props of propsByVolume) {
        const mp4File = `video-volume-${props.volume.index}.mp4`;
        const finalPath = resolve(runDirectory, mp4File);
        const partialPath = `${finalPath}.partial.mp4`;
        const composition = await deps.selectComposition({
          serveUrl,
          id: COMPOSITION_ID,
          inputProps: props,
        });
        try {
          await deps.renderMedia({
            composition,
            serveUrl,
            codec: "h264",
            outputLocation: partialPath,
            inputProps: props,
          });
          await rename(partialPath, finalPath);
        } catch (error) {
          await unlink(partialPath).catch(() => undefined);
          throw error;
        }
        volumes.push({
          index: props.volume.index,
          mp4File,
          durationSeconds: props.volume.totalSeconds,
          sceneIds: props.scenes.map((scene) => scene.id),
          ...(props.scenes.some((scene) => scene.audioFile)
            ? { audioFiles: props.scenes.flatMap((scene) => scene.audioFile ? [scene.audioFile] : []) }
            : {}),
        });
      }
      return { format: "showcraft.remotion/v1", runId, volumes };
    } catch (error) {
      throw renderFailure(error);
    }
  };
}

async function resolveDependencies(overrides?: Partial<RenderDependencies>): Promise<RenderDependencies> {
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([
    overrides?.bundle ? Promise.resolve({ bundle: overrides.bundle }) : import("@remotion/bundler"),
    overrides?.renderMedia && overrides.selectComposition
      ? Promise.resolve({ renderMedia: overrides.renderMedia, selectComposition: overrides.selectComposition })
      : import("@remotion/renderer"),
  ]);
  return {
    bundle,
    renderMedia: overrides?.renderMedia ?? (async (options) => { await renderMedia(options as never); }),
    selectComposition: overrides?.selectComposition ?? ((options) => selectComposition(options)),
  };
}

function renderFailure(error: unknown): Error {
  const rawDetail = error instanceof Error ? error.message : String(error);
  const browserHint = /chrome headless|could not find (?:a )?browser|browser executable/i.test(rawDetail)
    ? " Run `npx remotion browser ensure` once and retry."
    : "";
  const detail = rawDetail.slice(0, 2_048 - "[render] ".length - browserHint.length);
  return new Error(`[render] ${detail}${browserHint}`);
}
