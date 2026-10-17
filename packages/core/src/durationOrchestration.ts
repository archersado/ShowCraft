import type { ReleaseBrief, Scene } from "./domain.js";

/**
 * The single implementation of localized-video-composition R8 duration
 * orchestration. Story 4.3 renderers consume the volume view produced here.
 */

/** R8: opening and closing scenes must each be 10–15 seconds. */
export const INTRO_OUTRO_MIN_SECONDS = 10;
export const INTRO_OUTRO_MAX_SECONDS = 15;
/** R8: every feature scene must be 12–20 seconds. */
export const FEATURE_MIN_SECONDS = 12;
export const FEATURE_MAX_SECONDS = 20;
/** R8: a rendered volume must not exceed 90 seconds. */
export const VOLUME_LIMIT_SECONDS = 90;

export const INTRO_FEATURE_ID = "intro";
export const OUTRO_FEATURE_ID = "outro";

export const INTRO_OUTRO_DURATION_SECONDS = 12;
export const FEATURE_DURATION_SECONDS = 16;

export class DurationOrchestrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurationOrchestrationError";
  }
}

/** First-version deterministic feature duration; narration length is intentionally irrelevant. */
export function plannedFeatureDurationSeconds(narration: string): number {
  void narration;
  return FEATURE_DURATION_SECONDS;
}

export function buildIntroOutroScenes(release: ReleaseBrief): {
  intro: Scene;
  outro: Scene;
} {
  return {
    intro: {
      id: "scene-intro",
      featureId: INTRO_FEATURE_ID,
      title: "开场",
      narration: `欢迎了解 ${release.version} 版本的产品亮点。`,
      narrationSource: "generated",
      plannedDurationSeconds: INTRO_OUTRO_DURATION_SECONDS,
    },
    outro: {
      id: "scene-outro",
      featureId: OUTRO_FEATURE_ID,
      title: "结尾",
      narration: "以上是本次发布的主要亮点。",
      narrationSource: "generated",
      plannedDurationSeconds: INTRO_OUTRO_DURATION_SECONDS,
    },
  };
}

export function estimateTotalSeconds(scenes: readonly Scene[]): number {
  assertValidSceneDurations(scenes);
  return scenes.reduce((total, scene) => total + scene.plannedDurationSeconds, 0);
}

export type PlannedVolume = { scenes: Scene[] };

function assertValidSceneDurations(scenes: readonly Scene[]): void {
  for (const scene of scenes) {
    if (!Number.isFinite(scene.plannedDurationSeconds) || scene.plannedDurationSeconds <= 0) {
      throw new DurationOrchestrationError(
        `scene "${scene.id}" duration must be positive and finite`,
      );
    }
  }
}

/** Greedily preserve scene order; a scene is atomic and is never split across volumes. */
export function planVolumes(
  scenes: readonly Scene[],
  limit: number = VOLUME_LIMIT_SECONDS,
): PlannedVolume[] {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new DurationOrchestrationError("volume duration limit must be positive and finite");
  }
  assertValidSceneDurations(scenes);

  const volumes: PlannedVolume[] = [];
  let current: Scene[] = [];
  let currentDuration = 0;

  for (const scene of scenes) {
    if (scene.plannedDurationSeconds > limit) {
      throw new DurationOrchestrationError(
        `scene "${scene.id}" duration ${scene.plannedDurationSeconds}s exceeds volume limit ${limit}s`,
      );
    }
    if (current.length > 0 && currentDuration + scene.plannedDurationSeconds > limit) {
      volumes.push({ scenes: current });
      current = [];
      currentDuration = 0;
    }
    current.push(scene);
    currentDuration += scene.plannedDurationSeconds;
  }

  if (current.length > 0) {
    volumes.push({ scenes: current });
  }
  return volumes;
}
