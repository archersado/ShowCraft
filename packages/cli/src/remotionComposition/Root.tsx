import React from "react";
import { Composition, registerRoot } from "remotion";

import { VolumeComposition } from "./VolumeComposition";
import type { VolumeInputProps } from "./volumeProps";

export const COMPOSITION_ID = "showcraft-volume";
const FPS = 30;

const Root: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={VolumeComposition}
    width={1280}
    height={720}
    fps={FPS}
    durationInFrames={FPS}
    defaultProps={{ volume: { index: 1, totalSeconds: 1 }, fps: FPS, scenes: [] } satisfies VolumeInputProps}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.round(props.volume.totalSeconds * props.fps) })}
  />
);

registerRoot(Root);
