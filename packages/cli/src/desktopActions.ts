import { execFile } from "node:child_process";
import { get } from "node:http";
import { promisify } from "node:util";

import {
  DesktopRunnerError,
  type DemoActionRecord,
  type DesktopDemoPort,
  type DesktopRunnerPort,
  type GateDecision,
  type ReleaseBrief,
} from "@showcraft/core";

import { createStartUpOSDesktopRunner } from "./desktopLifecycle.js";

type ObservableRunner = DesktopRunnerPort & { readonly processGroupId?: number | null };
type Command = (file: string, args: readonly string[]) => Promise<string>;

export type DesktopActionsOptions = {
  startupOsRoot: string;
  requestTimeoutMs?: number;
  runner?: ObservableRunner;
  command?: Command;
};

type ObservationResult = Pick<DemoActionRecord, "status" | "reason" | "observations" | "diagnostics">;

const execFileAsync = promisify(execFile);
const DEFAULT_RENDERER_ORIGIN = "http://localhost:3100";
const MANAGEMENT_PATH = "/api/perception/management";
const MAX_DIAGNOSTICS = 2048;

function senseCenterUrl(origin: string): string {
  const url = new URL("/window", origin);
  url.searchParams.set("windowType", "sense-center");
  url.searchParams.set("title", "感知中心");
  return url.toString();
}

function boundedDiagnostics(value: unknown): string {
  const text = value instanceof DesktopRunnerError
    ? `phase=${value.phase}\n${value.diagnostics}`
    : value instanceof Error
      ? value.message
      : String(value);
  return text.length <= MAX_DIAGNOSTICS ? text : `…${text.slice(-(MAX_DIAGNOSTICS - 1))}`;
}

async function defaultCommand(file: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync(file, [...args], { encoding: "utf8" });
  return stdout;
}

async function portBelongsToGroup(
  pgid: number | null | undefined,
  command: Command,
): Promise<boolean> {
  if (!pgid) {
    return false;
  }
  const listeners = (await command("lsof", ["-tiTCP:3100", "-sTCP:LISTEN"]))
    .split(/\s+/)
    .filter(Boolean);
  if (listeners.length === 0) {
    return false;
  }
  for (const pid of listeners) {
    const owner = (await command("ps", ["-o", "pgid=", "-p", pid])).trim();
    if (Number(owner) !== pgid) {
      return false;
    }
  }
  return true;
}

type HttpResult = { status: number; body: string };

function getOnce(url: string, timeoutMs: number): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = get(url, { timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          request.destroy(new Error("response exceeds 2 MiB"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    request.on("timeout", () => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
  });
}

async function getWithRetry(url: string, timeoutMs: number): Promise<HttpResult> {
  try {
    return await getOnce(url, timeoutMs);
  } catch {
    return getOnce(url, timeoutMs);
  }
}

function is2xx(status: number): boolean {
  return status >= 200 && status < 300;
}

async function observePerceptionRouting(
  rendererUrl: string,
  timeoutMs: number,
): Promise<ObservationResult> {
  const route = await getWithRetry(rendererUrl, timeoutMs);
  if (!is2xx(route.status)) {
    return {
      status: "failed",
      reason: "action_failed",
      observations: { window_route_status: route.status },
      diagnostics: `window_route_status=${route.status}`,
    };
  }

  const managementUrl = new URL(MANAGEMENT_PATH, rendererUrl).toString();
  const management = await getWithRetry(managementUrl, timeoutMs);
  let shapeValid = false;
  let askUserCandidatePresent = false;
  try {
    const body = JSON.parse(management.body) as {
      success?: unknown;
      data?: { decisions?: Array<{ candidateKeys?: unknown }> };
    };
    const decisions = body.data?.decisions;
    if (Array.isArray(decisions)) {
      shapeValid =
        body.success === true &&
        decisions.every(
          (decision) =>
            Array.isArray(decision.candidateKeys) &&
            decision.candidateKeys.every((candidate) => typeof candidate === "string"),
        );
      askUserCandidatePresent =
        shapeValid &&
        decisions.some((decision) =>
          (decision.candidateKeys as string[]).includes("ask_user_to_choose_target"),
        );
    }
  } catch {
    shapeValid = false;
  }

  const observations = {
    window_route_status: route.status,
    management_api_status: management.status,
    management_shape_valid: shapeValid,
    ask_user_candidate_present: askUserCandidatePresent,
  };
  if (!is2xx(management.status) || !shapeValid || !askUserCandidatePresent) {
    return {
      status: "failed",
      reason: "action_failed",
      observations,
      diagnostics: `management_api_status=${management.status}\nmanagement_shape_valid=${shapeValid}\nask_user_candidate_present=${askUserCandidatePresent}`,
    };
  }
  return { status: "executed", reason: "eligible", observations };
}

const ACTIONS = new Map<string, typeof observePerceptionRouting>([
  ["section-1-im", observePerceptionRouting],
]);

function baseRecord(release: ReleaseBrief, decision: GateDecision): Pick<DemoActionRecord, "featureId" | "sourceRef" | "evidenceIds"> {
  const feature = release.features.find((candidate) => candidate.id === decision.featureId);
  if (!feature?.sourceRef) {
    throw new Error(`Feature ${decision.featureId} has no sourceRef for desktop audit`);
  }
  return {
    featureId: decision.featureId,
    sourceRef: { ...feature.sourceRef },
    evidenceIds: [...decision.evidenceIds],
  };
}

export function createStartUpOSDemoActions(options: DesktopActionsOptions): DesktopDemoPort {
  const rendererUrl = senseCenterUrl(DEFAULT_RENDERER_ORIGIN);
  const runner =
    options.runner ??
    createStartUpOSDesktopRunner({ startupOsRoot: options.startupOsRoot, rendererUrl });
  const command = options.command ?? defaultCommand;
  const timeoutMs = options.requestTimeoutMs ?? 30_000;

  return async (release, gate) => {
    const records: DemoActionRecord[] = [];
    const runnable = gate.decisions.filter(
      (decision) => decision.reason === "eligible" && ACTIONS.has(decision.featureId),
    );

    for (const decision of gate.decisions) {
      const base = baseRecord(release, decision);
      if (decision.reason !== "eligible") {
        records.push({ ...base, status: "skipped", reason: decision.reason });
      } else if (!ACTIONS.has(decision.featureId)) {
        records.push({ ...base, status: "skipped", reason: "unsupported_feature" });
      }
    }
    if (runnable.length === 0) {
      return records;
    }

    let actionRecords: DemoActionRecord[] = [];
    let startFailed = false;
    let startError: unknown;
    let stopFailed = false;
    let stopError: unknown;
    try {
      const startInfo = await runner.start();
      const owned = await portBelongsToGroup(runner.processGroupId, command).catch(() => false);
      if (!owned) {
        actionRecords = runnable.map((decision) => ({
          ...baseRecord(release, decision),
          status: "failed",
          reason: "port_owner_mismatch",
          observations: { port_owner_in_group: false },
          diagnostics: "port_owner_in_group=false",
        }));
      } else {
        for (const decision of runnable) {
          const implementation = ACTIONS.get(decision.featureId)!;
          try {
            const result = await implementation(startInfo.rendererUrl, timeoutMs);
            actionRecords.push({ ...baseRecord(release, decision), ...result });
          } catch (error) {
            actionRecords.push({
              ...baseRecord(release, decision),
              status: "failed",
              reason: "action_failed",
              diagnostics: boundedDiagnostics(error),
            });
          }
        }
      }
    } catch (error) {
      startFailed = true;
      startError = error;
    } finally {
      try {
        await runner.stop();
      } catch (error) {
        stopFailed = true;
        stopError = error;
      }
    }

    if (startFailed) {
      const diagnostics = boundedDiagnostics(startError);
      const combined = stopFailed
        ? boundedDiagnostics(`${diagnostics}\nstop_failure=${boundedDiagnostics(stopError)}`)
        : diagnostics;
      throw new Error(combined);
    }

    if (stopFailed) {
      const diagnostic = boundedDiagnostics(stopError);
      actionRecords = runnable.map((decision) => {
        const existing = actionRecords.find((record) => record.featureId === decision.featureId);
        return {
          ...baseRecord(release, decision),
          ...(existing?.observations ? { observations: existing.observations } : {}),
          status: "failed" as const,
          reason: existing?.status === "failed" ? existing.reason : ("stop_failed" as const),
          diagnostics: boundedDiagnostics(
            existing?.diagnostics ? `${existing.diagnostics}\nstop_failure=${diagnostic}` : diagnostic,
          ),
        };
      });
    }
    const decisionOrder = new Map(gate.decisions.map((decision, index) => [decision.featureId, index]));
    return [...records, ...actionRecords].sort(
      (left, right) => decisionOrder.get(left.featureId)! - decisionOrder.get(right.featureId)!,
    );
  };
}
