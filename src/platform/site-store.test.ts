import { describe, expect, it } from "vitest";
import { registryPromptRunTimes } from "./site-store";

describe("registry prompt scheduling", () => {
  it("starts a never-observed prompt immediately", () => {
    const now = new Date("2026-08-28T09:00:00Z");
    expect(registryPromptRunTimes(null, now)).toEqual({ lastRunAt: null, nextRunAt: now });
  });

  it("waits seven days after the latest legacy observation", () => {
    const last = new Date("2026-08-28T06:04:00Z");
    expect(registryPromptRunTimes(last).nextRunAt).toEqual(new Date("2026-09-04T06:04:00Z"));
  });
});
