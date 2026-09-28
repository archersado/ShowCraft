import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import {
  createMockReleaseSource,
  createMockRenderer,
  createMockScenePlanner,
  RunStoreCore,
  runPipeline,
} from "@showcraft/core";

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
  // CLI assembles mock adapters; core only sees the ports.
  await runPipeline(
    {
      releaseSource: createMockReleaseSource(),
      scenePlanner: createMockScenePlanner(),
      renderer: createMockRenderer(),
    },
    store,
  );

  if (store.currentStatus !== "completed") {
    const failure = store.currentFailure;
    throw new Error(
      `Demo pipeline failed at ${failure?.stage ?? "unknown stage"}: ${failure?.reason ?? "no diagnostics"}`,
    );
  }

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
