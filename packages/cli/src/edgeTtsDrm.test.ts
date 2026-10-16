import { describe, expect, it } from "vitest";

import { generateSecMsGecV2 } from "./edgeTtsDrm.js";

describe("generateSecMsGecV2", () => {
  it("matches the edge-tts 7.3.1 fixed vector", () => {
    expect(generateSecMsGecV2(1_792_064_756.9800708)).toBe(
      "F22985E6626F6D9A-A1AEE147C4F7AFEA6A26ED5C4EA9BCA0C0AF4C26AE355E408FAACC5851417BD9",
    );
  });

  it("is stable within the same five-minute window", () => {
    expect(generateSecMsGecV2(1_792_064_701)).toBe(generateSecMsGecV2(1_792_064_799));
  });

  it("rejects timestamps that cannot produce a service token", () => {
    expect(() => generateSecMsGecV2(Number.NaN)).toThrow(RangeError);
    expect(() => generateSecMsGecV2(-1)).toThrow(RangeError);
  });
});
