import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  RunAlreadyExistsError,
  RunStoreCore,
  type RunStoreEvent,
  type RunStoreFile,
} from "@showcraft/core";

/**
 * Filesystem adapter for the run store core: persists the staged stable JSON
 * bytes of a run into its run directory. Directory creation and writes are
 * the CLI's responsibility per the ports-and-adapters split.
 */

export type PersistedRun = {
  runDirectory: string;
  status: "completed" | "failed";
  files: string[];
};

export async function createRunDirectory(
  outputRoot: string,
  runId: string,
  options: { cwd?: string } = {},
): Promise<string> {
  const root = resolve(options.cwd ?? process.cwd(), outputRoot);
  const runDirectory = resolve(root, runId);

  let existing;
  try {
    existing = await stat(runDirectory);
  } catch {
    existing = undefined;
  }
  if (existing?.isDirectory()) {
    throw new RunAlreadyExistsError(runId);
  }

  try {
    await mkdir(root, { recursive: true });
    await mkdir(runDirectory);
  } catch (error) {
    throw new Error(`Unable to create run directory ${runDirectory}: ${formatError(error)}`);
  }
  return runDirectory;
}

/** Write every staged file from the store core into the run directory. */
export async function persistRunEvents(
  runDirectory: string,
  events: readonly (RunStoreEvent | RunStoreFile)[],
): Promise<string[]> {
  const written: string[] = [];
  try {
    for (const event of events) {
      const file = "fileName" in event ? event : event.file;
      await writeFile(resolve(runDirectory, file.fileName), file.bytes, "utf8");
      written.push(file.fileName);
    }
  } catch (error) {
    throw new Error(`Unable to write run artifacts in ${runDirectory}: ${formatError(error)}`);
  }
  return written;
}

/** Convenience wrapper: create the directory, then persist whatever the core staged. */
export async function persistRun(
  outputRoot: string,
  store: RunStoreCore,
  options: { cwd?: string } = {},
): Promise<PersistedRun> {
  const runDirectory = await createRunDirectory(outputRoot, store.id, options);
  const files = await persistRunEvents(runDirectory, store.collectFiles());
  return { runDirectory, status: store.currentStatus === "completed" ? "completed" : "failed", files };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
