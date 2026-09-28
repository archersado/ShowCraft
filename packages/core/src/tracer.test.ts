import { describe, expect, it } from "vitest";

import { createMockTracerResult } from "./tracer.js";

describe("createMockTracerResult", () => {
  it("creates a completed release-to-manifest tracer result", () => {
    const result = createMockTracerResult();

    expect(result.release.features).toHaveLength(1);
    expect(result.manifest.releaseVersion).toBe(result.release.version);
    expect(result.manifest.scenes[0]).toMatchObject({
      featureId: result.release.features[0]?.id,
      title: result.release.features[0]?.title,
    });
    expect(result.run).toEqual({
      format: "showcraft.mock-run/v1",
      status: "completed",
      artifacts: ["release.json", "manifest.json"],
    });
  });
});
