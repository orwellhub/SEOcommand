import { describe, it, expect } from "vitest";
import { canSpend, crossedThresholds, remaining } from "./budget";

describe("budget / spending-limit enforcement", () => {
  it("reports crossed alert thresholds at 50/75/90/100", () => {
    expect(crossedThresholds({ limitUsd: 200, spentUsd: 0 })).toEqual([]);
    expect(crossedThresholds({ limitUsd: 200, spentUsd: 100 })).toEqual([50]);
    expect(crossedThresholds({ limitUsd: 200, spentUsd: 150 })).toEqual([50, 75]);
    expect(crossedThresholds({ limitUsd: 200, spentUsd: 200 })).toEqual([50, 75, 90, 100]);
  });

  it("blocks a request that would exceed the hard limit", () => {
    expect(canSpend({ limitUsd: 200, spentUsd: 190 }, 20)).toBe(false);
    expect(canSpend({ limitUsd: 200, spentUsd: 190 }, 5)).toBe(true);
  });

  it("pauses non-critical work once fully spent but allows critical up to the limit", () => {
    const spent = { limitUsd: 200, spentUsd: 200 };
    expect(canSpend(spent, 0, { critical: false })).toBe(false);
    expect(canSpend(spent, 0, { critical: true })).toBe(true);
  });

  it("computes remaining budget without going negative", () => {
    expect(remaining({ limitUsd: 200, spentUsd: 250 })).toBe(0);
    expect(remaining({ limitUsd: 200, spentUsd: 50 })).toBe(150);
  });
});
