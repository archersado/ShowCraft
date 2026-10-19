import { describe, expect, it } from "vitest";

import type { ReleaseBrief, Scene } from "./domain.js";
import {
  DurationOrchestrationError,
  FEATURE_DURATION_SECONDS,
  FEATURE_MAX_SECONDS,
  FEATURE_MIN_SECONDS,
  INTRO_OUTRO_DURATION_SECONDS,
  INTRO_OUTRO_MAX_SECONDS,
  INTRO_OUTRO_MIN_SECONDS,
  VOLUME_LIMIT_SECONDS,
  buildIntroOutroScenes,
  estimateTotalSeconds,
  planVolumes,
  plannedFeatureDurationSeconds,
} from "./durationOrchestration.js";

function releaseWithFeatures(count: number): ReleaseBrief {
  return {
    version: "v1",
    source: "fixture.md",
    features: Array.from({ length: count }, (_, index) => ({
      id: `feature-${index + 1}`,
      title: `功能 ${index + 1}`,
      narration: `功能 ${index + 1} 的旁白`,
    })),
  };
}

function orchestratedScenes(count: number): Scene[] {
  const release = releaseWithFeatures(count);
  const { intro, outro } = buildIntroOutroScenes(release);
  return [
    intro,
    ...release.features.map((feature) => ({
      id: `scene-${feature.id}`,
      featureId: feature.id,
      title: feature.title,
      narration: feature.narration,
      narrationSource: "narration" as const,
      plannedDurationSeconds: plannedFeatureDurationSeconds(feature.narration),
    })),
    outro,
  ];
}

describe("duration orchestration", () => {
  it("keeps all fixed durations inside the R8 windows", () => {
    expect(INTRO_OUTRO_DURATION_SECONDS).toBeGreaterThanOrEqual(INTRO_OUTRO_MIN_SECONDS);
    expect(INTRO_OUTRO_DURATION_SECONDS).toBeLessThanOrEqual(INTRO_OUTRO_MAX_SECONDS);
    expect(FEATURE_DURATION_SECONDS).toBeGreaterThanOrEqual(FEATURE_MIN_SECONDS);
    expect(FEATURE_DURATION_SECONDS).toBeLessThanOrEqual(FEATURE_MAX_SECONDS);
    expect(VOLUME_LIMIT_SECONDS).toBe(90);
  });

  it.each([
    [1, 40, 1, [3]],
    [3, 72, 1, [5]],
    [6, 120, 2, [5, 3]],
  ])("plans %i features into stable <=90s volumes", (count, total, volumeCount, sizes) => {
    const scenes = orchestratedScenes(count);
    const volumes = planVolumes(scenes);
    expect(estimateTotalSeconds(scenes)).toBe(total);
    expect(volumes).toHaveLength(volumeCount);
    expect(volumes.map((volume) => volume.scenes.length)).toEqual(sizes);
    expect(volumes.every((volume) => estimateTotalSeconds(volume.scenes) <= 90)).toBe(true);
    expect(volumes.flatMap((volume) => volume.scenes.map((scene) => scene.id))).toEqual(
      scenes.map((scene) => scene.id),
    );
  });

  it("does not split an exactly 90-second sequence", () => {
    const scenes = orchestratedScenes(4).map((scene, index, all) => ({
      ...scene,
      plannedDurationSeconds: index === 0 || index === all.length - 1 ? 13 : 16,
    }));
    expect(estimateTotalSeconds(scenes)).toBe(90);
    expect(planVolumes(scenes)).toHaveLength(1);
  });

  it("fails explicitly when one atomic scene exceeds the volume limit", () => {
    const scene = { ...orchestratedScenes(1)[1]!, plannedDurationSeconds: 120 };
    expect(() => planVolumes([scene])).toThrow(DurationOrchestrationError);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects invalid scene duration %s in every scene-duration consumer",
    (plannedDurationSeconds) => {
      const invalid = [{ ...orchestratedScenes(1)[1]!, plannedDurationSeconds }];
      expect(() => estimateTotalSeconds(invalid)).toThrow(DurationOrchestrationError);
      expect(() => planVolumes(invalid)).toThrow(DurationOrchestrationError);
    },
  );

  it("allows multiple scenes for one feature to cross a volume boundary without splitting scenes", () => {
    const base = orchestratedScenes(1)[1]!;
    const scenes = Array.from({ length: 10 }, (_, index) => ({ ...base, id: `scene-a-${index}` }));
    const volumes = planVolumes(scenes);
    expect(volumes).toHaveLength(2);
    expect(volumes.map((volume) => volume.scenes.length)).toEqual([5, 5]);
    expect(volumes.flatMap((volume) => volume.scenes)).toEqual(scenes);
  });

  it("is deterministic for identical input", () => {
    const scenes = orchestratedScenes(6);
    expect(planVolumes(scenes)).toEqual(planVolumes(scenes));
    expect(buildIntroOutroScenes(releaseWithFeatures(1))).toEqual(
      buildIntroOutroScenes(releaseWithFeatures(1)),
    );
  });
});
