import { describe, expect, it } from "vitest";
import { siteConstellationPosition } from "./portfolio-layout";

describe("portfolio constellation layout", () => {
  it("places 20 websites in a readable four-column grid", () => {
    const positions = Array.from({ length: 20 }, (_, index) => siteConstellationPosition(index));
    expect(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(20);
    expect(Math.min(...positions.map(({ x }) => x))).toBeGreaterThanOrEqual(50);
    expect(Math.max(...positions.map(({ x }) => x))).toBeLessThanOrEqual(95);
    expect(Math.min(...positions.map(({ y }) => y))).toBeGreaterThanOrEqual(25);
    expect(Math.max(...positions.map(({ y }) => y))).toBeLessThanOrEqual(90);
  });
});
