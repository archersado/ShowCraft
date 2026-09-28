import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createMockTracerResult, RunStoreCore } from "@showcraft/core";

import { createRunDirectory, persistRunEvents } from "./runStore.js";

export type DemoOptions = {
  outputRoot?: string;
  runId?: string;
  cwd?: string;
};

export type DemoResult = {
  runDirectory: string;
  status: "completed";
};

export async function runDemo(options: DemoOptions = {}): Promise<DemoResult> {
  const outputRoot = options.outputRoot ?? "runs";
  const runId = options.runId ?? `demo-${Date.now()}-${randomUUID().slice(0, 8)}`;
  validateRunId(runId);

  const store = new RunStoreCore(runId);
  const tracer = createMockTracerResult();

  // Stage artifacts through the run store so they are schema-validated and
  // deterministically serialized; the tracer's release doubles as the scene
  // plan source until a real scene stage exists.
  store.recordArtifact({ stage: "release", value: tracer.release });
  store.recordArtifact({
    stage: "scenePlan",
    value: {
      releaseVersion: tracer.release.version,
      scenes: tracer.manifest.scenes.map((scene) => ({
        id: scene.id,
        featureId: scene.featureId,
        title: scene.title,
        narration: scene.narration,
        narrationSource: "narration" as const,
        plannedDurationSeconds: 15,
      })),
    },
  });
  store.recordArtifact({ stage: "manifest", value: tracer.manifest });
  store.complete();

  const runDirectory = await createRunDirectory(outputRoot, runId, { cwd: options.cwd });
  await persistRunEvents(runDirectory, store.collectFiles());

  return { runDirectory, status: "completed" as const };
}

export function parseDemoArgs(args: readonly string[]): Pick<DemoOptions, "outputRoot"> {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;

  if (normalizedArgs.length === 0) {
    return {};
  }

  if (normalizedArgs.length === 2 && normalizedArgs[0] === "--output" && normalizedArgs[1]) {
    return { outputRoot: normalizedArgs[1] };
  }

  throw new Error("Usage: pnpm demo -- [--output <directory>]");
}

function validateRunId(runId: string): void {
  if (!runId || runId === "." || runId === ".." || basename(runId) !== runId) {
    throw new Error(`Invalid run ID: ${runId}`);
  }
}

async function main(): Promise<void> {
  const result = await runDemo(parseDemoArgs(process.argv.slice(2)));
  console.log(`Run directory: ${result.runDirectory}`);
  console.log(`Status: ${result.status}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
