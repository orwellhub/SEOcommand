import { describe, it, expect } from "vitest";
import { compactNumber } from "./format";

describe("compactNumber", () => {
  it("rounds sub-thousand floats to whole numbers (no long decimals)", () => {
    expect(compactNumber(200.67471852339804)).toBe("201");
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(42)).toBe("42");
  });

  it("compacts thousands and millions", () => {
    expect(compactNumber(1500)).toBe("1.5K");
    expect(compactNumber(2000)).toBe("2K");
    expect(compactNumber(1_500_000)).toBe("1.5M");
  });
});
