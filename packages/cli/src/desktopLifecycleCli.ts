import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DesktopRunnerError } from "@showcraft/core";

import { createStartUpOSDesktopRunner } from "./desktopLifecycle.js";

/**
 * Manual verification entry for the StartUpOS Desktop lifecycle adapter
 * (story 3.1). Starts the real desktop app, prints per-phase progress with
 * measured timings, holds for `--hold-seconds`, then stops the whole process
 * group and reports leftovers. The exit code reflects success/failure; child
 * output is relayed with a `[desktop]` prefix.
 *
 * Usage:
 *   pnpm desktop:lifecycle -- --startupos /path/to/startupOS \
 *     [--hold-seconds 5] [--timeout-ms 180000]
 */

type CliArgs = {
  startupOsRoot: string;
  holdSeconds: number;
  timeoutMs: number;
};

function parseArgs(argv: readonly string[]): CliArgs {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  const parsed: Partial<CliArgs> = {};
  for (let index = 0; index < normalized.length; index += 2) {
    const flag = normalized[index];
    const value = normalized[index + 1];
    if (flag === "--startupos" && value) {
      parsed.startupOsRoot = value;
    } else if (flag === "--hold-seconds" && value) {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error(`--hold-seconds must be a non-negative number, got: ${value}`);
      }
      parsed.holdSeconds = seconds;
    } else if (flag === "--timeout-ms" && value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms <= 0) {
        throw new Error(`--timeout-ms must be a positive number, got: ${ms}`);
      }
      parsed.timeoutMs = ms;
    } else {
      throw usageError();
    }
  }
  if (!parsed.startupOsRoot) {
    throw usageError();
  }
  return {
    startupOsRoot: parsed.startupOsRoot,
    holdSeconds: parsed.holdSeconds ?? 5,
    timeoutMs: parsed.timeoutMs ?? 180_000,
  };
}

function usageError(): Error {
  return new Error(
    "Usage: pnpm desktop:lifecycle -- --startupos <path> [--hold-seconds 5] [--timeout-ms 180000]",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runner = createStartUpOSDesktopRunner({
    startupOsRoot: args.startupOsRoot,
    readinessTimeoutMs: args.timeoutMs,
  });

  console.log(`[lifecycle] start: spawning StartUpOS desktop at ${args.startupOsRoot}`);
  const startedAt = Date.now();
  let info;
  try {
    info = await runner.start();
  } catch (error) {
    if (error instanceof DesktopRunnerError) {
      console.error(`[lifecycle] start FAILED (${error.phase}) after ${Date.now() - startedAt}ms`);
      console.error("[lifecycle] diagnostics:\n" + error.diagnostics);
    } else {
      console.error(`[lifecycle] start FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
    return;
  }
  const readyMs = Date.now() - startedAt;
  console.log(`[lifecycle] ready: renderer at ${info.rendererUrl} (ready in ${readyMs}ms)`);

  console.log(`[lifecycle] hold: keeping the app open for ${args.holdSeconds}s…`);
  await new Promise((resolve) => setTimeout(resolve, args.holdSeconds * 1000));

  const stopAt = Date.now();
  try {
    await runner.stop();
  } catch (error) {
    if (error instanceof DesktopRunnerError) {
      console.error(`[lifecycle] stop FAILED after ${Date.now() - stopAt}ms`);
      console.error("[lifecycle] diagnostics:\n" + error.diagnostics);
    } else {
      console.error(`[lifecycle] stop FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`[lifecycle] stopped: process group reclaimed in ${Date.now() - stopAt}ms (zero leftovers)`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
