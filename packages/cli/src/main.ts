import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createMockTracerResult } from "@showcraft/core";

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
  const outputRoot = resolve(options.cwd ?? process.cwd(), options.outputRoot ?? "runs");
  const runId = options.runId ?? `demo-${Date.now()}-${randomUUID().slice(0, 8)}`;
  validateRunId(runId);
  const runDirectory = resolve(outputRoot, runId);

  try {
    await mkdir(outputRoot, { recursive: true });
    await mkdir(runDirectory);
  } catch (error) {
    throw new Error(`Unable to create run directory ${runDirectory}: ${formatError(error)}`);
  }

  const tracer = createMockTracerResult();
  try {
    await writeJson(runDirectory, "release.json", tracer.release);
    await writeJson(runDirectory, "manifest.json", tracer.manifest);
    await writeJson(runDirectory, "run.json", tracer.run);
  } catch (error) {
    throw new Error(`Unable to write demo artifacts in ${runDirectory}: ${formatError(error)}`);
  }

  return { runDirectory, status: tracer.run.status };
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

async function writeJson(directory: string, fileName: string, value: unknown): Promise<void> {
  await writeFile(resolve(directory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
