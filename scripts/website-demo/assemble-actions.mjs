/* global console, process */

import { readFile, writeFile } from "node:fs/promises";

import { demoActionsSchema, stableJsonBytes } from "../../packages/core/src/index.ts";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error(`invalid argument near ${key ?? "end of input"}`);
  }
  values.set(key.slice(2), value);
}

const required = (key) => {
  const value = values.get(key);
  if (!value) throw new Error(`--${key} is required`);
  return value;
};

const resultPath = required("result");
const outputPath = required("output");
const recordingState = required("recording-state");
const mediaFile = values.get("media-file");
const pageResult = JSON.parse(await readFile(resultPath, "utf8"));

if (!["valid", "invalid"].includes(recordingState)) {
  throw new Error("--recording-state must be valid or invalid");
}

const pageSucceeded =
  pageResult?.pageStatus === 200 && pageResult?.matchedResultPresent === true;
const recordingSucceeded = recordingState === "valid";
const diagnostics = String(pageResult?.diagnostics ?? "website demo capture failed").slice(0, 2048);

let action;
if (!recordingSucceeded) {
  action = {
    featureId: "website-quote-match",
    status: "failed",
    reason: "recording_failed",
    sourceRef: {
      sectionIndex: 5,
      sectionTitle: "Tasks & Acceptance",
      startLine: 64,
      endLine: 66,
    },
    evidenceIds: ["story-website-demo-capture-plan"],
    observations: {},
    diagnostics: "recording validation failed",
  };
} else if (!pageSucceeded) {
  action = {
    featureId: "website-quote-match",
    status: "failed",
    reason: "action_failed",
    sourceRef: {
      sectionIndex: 5,
      sectionTitle: "Tasks & Acceptance",
      startLine: 64,
      endLine: 66,
    },
    evidenceIds: ["story-website-demo-capture-plan"],
    observations: {},
    media: { file: mediaFile ?? "recording-website-quote-match.mov" },
    diagnostics,
  };
} else {
  action = {
    featureId: "website-quote-match",
    status: "executed",
    reason: "eligible",
    sourceRef: {
      sectionIndex: 5,
      sectionTitle: "Tasks & Acceptance",
      startLine: 64,
      endLine: 66,
    },
    evidenceIds: ["story-website-demo-capture-plan"],
    observations: {},
    media: { file: mediaFile ?? "recording-website-quote-match.mov" },
  };
}

const actions = demoActionsSchema.parse({
  releaseVersion: "deepmatch-website",
  threshold: 1,
  actions: [action],
});

await writeFile(outputPath, stableJsonBytes(actions));
console.log(`[showcraft:website-demo] actions=${outputPath}`);
