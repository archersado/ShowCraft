/* global console, document, process, taskSpace */

const input = globalThis.__SHOWCRAFT_WEBSITE_DEMO_INPUT__;

if (
  !input ||
  typeof input.baseUrl !== "string" ||
  typeof input.samplePath !== "string" ||
  typeof input.screenshotPath !== "string" ||
  typeof input.resultPath !== "string" ||
  typeof input.taskSpaceName !== "string"
) {
  throw new Error("website demo input is missing or invalid");
}

const { writeFile } = await import("node:fs/promises");

const startedAt = Date.now();
let task;
let pageStatus = 0;
let matchedResultPresent = false;
let diagnostics;
let finishDiagnostics;

try {
  task = await taskSpace(input.taskSpaceName);
  const page = task.page("p1");

  await page.goto(input.baseUrl, { timeout: 30_000, waitUntil: "load" });
  const pageResponse = await page.fetch(input.baseUrl, { timeout: 30_000 });
  pageStatus = pageResponse.status;
  if (pageStatus !== 200) {
    throw new Error(`DeepMatch page returned HTTP ${pageStatus}`);
  }

  await page.waitForSelector("loc=css:#quote-drawing-upload", {
    state: "attached",
    timeout: 15_000,
  });
  await page.setInputFiles("loc=css:#quote-drawing-upload", [input.samplePath]);
  await page.waitForSelector("loc=css:#quote-drawing-upload", {
    state: "detached",
    timeout: 120_000,
  });

  await page.evaluate(() => {
    document.querySelector("#quick-quote")?.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: input.screenshotPath, fullPage: false });
  matchedResultPresent = true;
} catch (error) {
  diagnostics = error instanceof Error ? error.message : String(error);
} finally {
  if (task) {
    try {
      await task.finish({ keep: [] });
    } catch (error) {
      finishDiagnostics = error instanceof Error ? error.message : String(error);
    }
  }
}

if (finishDiagnostics) {
  diagnostics = diagnostics
    ? `${diagnostics}; task-space cleanup failed: ${finishDiagnostics}`
    : `task-space cleanup failed: ${finishDiagnostics}`;
}

const result = {
  pageStatus,
  matchedResultPresent,
  elapsedMs: Date.now() - startedAt,
  taskSpaceName: input.taskSpaceName,
  ...(diagnostics ? { diagnostics: diagnostics.slice(0, 2048) } : {}),
};

await writeFile(input.resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`[showcraft:website-demo] ${JSON.stringify(result)}`);

if (!matchedResultPresent || finishDiagnostics) {
  process.exitCode = 1;
}
