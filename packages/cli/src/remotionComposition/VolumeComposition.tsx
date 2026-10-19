import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";

import type { VolumeInputProps, VolumeSceneProps } from "./volumeProps";

export const VolumeComposition: React.FC<VolumeInputProps> = ({ scenes, fps }) => (
  <AbsoluteFill style={{ backgroundColor: "#08111f", color: "white", fontFamily: "system-ui, sans-serif" }}>
    {scenes.map((scene) => (
      <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
        <SceneCard scene={scene} fps={fps} />
        {scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}
      </Sequence>
    ))}
  </AbsoluteFill>
);

const SceneCard: React.FC<{ scene: VolumeSceneProps; fps: number }> = ({ scene, fps }) => {
  const frame = useCurrentFrame();
  const elapsedMs = frame / fps * 1_000;
  const subtitle = scene.subtitles.find((item) => elapsedMs >= item.startMs && elapsedMs < item.endMs);
  const synthetic = scene.featureId === "intro" || scene.featureId === "outro";
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 72, background: synthetic ? "linear-gradient(135deg,#17345f,#6d28d9)" : "linear-gradient(135deg,#07182f,#0f766e)" }}>
      <div style={{ fontSize: 24, opacity: 0.7, marginBottom: 20 }}>ShowCraft</div>
      <div style={{ fontSize: 58, fontWeight: 750, textAlign: "center" }}>{scene.title}</div>
      <div style={{ fontSize: 30, lineHeight: 1.5, maxWidth: 980, marginTop: 32, textAlign: "center", opacity: 0.9 }}>{scene.narration}</div>
      {subtitle ? <div style={{ position: "absolute", bottom: 52, background: "rgba(0,0,0,.72)", padding: "12px 24px", borderRadius: 10, fontSize: 28 }}>{subtitle.text}</div> : null}
    </AbsoluteFill>
  );
};
