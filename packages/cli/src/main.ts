import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import {
  createMockReleaseSource,
  createMockRenderer,
  createMockScenePlanner,
  normalizeSectionsToFeatures,
  parseReleaseDocument,
  parseReleaseSourceRef,
  releaseBriefSchema,
  ReleaseSourceError,
  RunStoreCore,
  runPipeline,
  validateLocalSource,
  isSecretPath,
  type ReleaseBrief,
} from "@showcraft/core";

import { createRunDirectory, persistRunEvents } from "./runStore.js";

export type DemoOptions = {
  outputRoot?: string;
  runId?: string;
  cwd?: string;
  source?: string;
};

export type DemoResult = {
  runDirectory: string;
  status: "completed";
};

export async function runDemo(options: DemoOptions = {}): Promise<DemoResult> {
  const outputRoot = options.outputRoot ?? "runs";
  const runId = options.runId ?? `demo-${Date.now()}-${randomUUID().slice(0, 8)}`;
  validateRunId(runId);

  const releaseSource = options.source
    ? await createFileReleaseSource(options.source, { cwd: options.cwd })
    : createMockReleaseSource();

  const store = new RunStoreCore(runId);
  // CLI assembles the adapters; core only sees the ports.
  await runPipeline(
    {
      releaseSource,
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

/**
 * Build a release source port from a local Markdown file. The path is
 * validated by the core security rules before its content is read; sections
 * are normalized into features (with sourceRef provenance) by the core
 * mapping shared with the rest of the pipeline.
 */
async function createFileReleaseSource(
  rawSource: string,
  options: { cwd?: string },
): Promise<() => Promise<ReleaseBrief>> {
  const ref = parseReleaseSourceRef(rawSource);
  if (ref.kind === "github") {
    // URL format was already validated; real fetching is a later story.
    throw new ReleaseSourceError(
      "invalid_url",
      `GitHub fetching is not implemented yet; use a local path: ${ref.url}`,
    );
  }
  const absolutePath = resolve(options.cwd ?? process.cwd(), ref.path);
  // Secret paths are refused by name before any filesystem probing occurs.
  if (isSecretPath(ref.path)) {
    throw new ReleaseSourceError(
      "secret_file",
      `Refusing to read potential secret file: ${ref.path}`,
    );
  }
  const facts = await statSource(absolutePath);
  validateLocalSource(ref, facts);

  const text = await readFile(absolutePath, "utf8");
  const document = parseReleaseDocument(text);
  const sourceDigest = createHash("sha256").update(text).digest("hex");
  const version = document.version ?? basename(absolutePath);

  return async () => {
    const brief = {
      version,
      source: absolutePath,
      sourceDigest,
      features: normalizeSectionsToFeatures(document.sections),
    };
    return releaseBriefSchema.parse(brief);
  };
}

async function statSource(path: string): Promise<{ exists: boolean; isDirectory: boolean }> {
  try {
    const stats = await stat(path);
    return { exists: true, isDirectory: stats.isDirectory() };
  } catch {
    return { exists: false, isDirectory: false };
  }
}

export function parseDemoArgs(
  args: readonly string[],
): Pick<DemoOptions, "outputRoot" | "source"> {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;

  const parsed: Pick<DemoOptions, "outputRoot" | "source"> = {};
  for (let index = 0; index < normalizedArgs.length; index += 2) {
    const flag = normalizedArgs[index];
    const value = normalizedArgs[index + 1];
    if (flag === "--output" && value) {
      parsed.outputRoot = value;
    } else if (flag === "--source" && value) {
      parsed.source = value;
    } else {
      throw new Error("Usage: pnpm demo -- [--output <directory>] [--source <markdown-path>]");
    }
  }
  return parsed;
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
