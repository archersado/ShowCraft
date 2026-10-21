import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const pageFlowUrl = pathToFileURL(
  join(process.cwd(), "scripts/website-demo/page-flow.mjs"),
).href;

const runPageFlow = async (postResultHoldMs: number) => {
  const directory = await mkdtemp(join(tmpdir(), "showcraft-page-flow-"));
  const resultPath = join(directory, "result.json");
  const events: string[] = [];
  const waits: number[] = [];
  const page = {
    goto: vi.fn(),
    fetch: vi.fn().mockResolvedValue({ status: 200 }),
    waitForSelector: vi.fn(),
    setInputFiles: vi.fn(),
    evaluate: vi.fn(),
    waitForTimeout: vi.fn(async (delay: number) => {
      waits.push(delay);
      events.push(`wait:${delay}`);
    }),
    screenshot: vi.fn(async () => {
      events.push("screenshot");
    }),
  };
  const finish = vi.fn(async () => {
    events.push("finish");
  });

  Object.assign(globalThis, {
    __SHOWCRAFT_WEBSITE_DEMO_INPUT__: {
      baseUrl: "http://127.0.0.1:4321/",
      samplePath: join(directory, "sample.pdf"),
      screenshotPath: join(directory, "matched-state.png"),
      resultPath,
      taskSpaceName: "page-flow-test",
      postResultHoldMs,
    },
    taskSpace: vi.fn().mockResolvedValue({
      page: vi.fn().mockReturnValue(page),
      finish,
    }),
  });

  await import(`${pageFlowUrl}?case=${postResultHoldMs}-${crypto.randomUUID()}`);

  const result = {
    events,
    waits,
    result: JSON.parse(await readFile(resultPath, "utf8")),
  };
  await rm(directory, { recursive: true, force: true });
  return result;
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__SHOWCRAFT_WEBSITE_DEMO_INPUT__");
  Reflect.deleteProperty(globalThis, "taskSpace");
});

describe("website demo page flow result hold", () => {
  it("holds a recording result before finishing the task space", async () => {
    const run = await runPageFlow(5000);

    expect(run.waits).toEqual([300, 5000]);
    expect(run.events).toEqual(["wait:300", "screenshot", "wait:5000", "finish"]);
    expect(run.result.postResultHoldMs).toBe(5000);
  });

  it("does not add a post-result hold for dry-run input", async () => {
    const run = await runPageFlow(0);

    expect(run.waits).toEqual([300]);
    expect(run.events).toEqual(["wait:300", "screenshot", "finish"]);
    expect(run.result.postResultHoldMs).toBe(0);
  });
});
