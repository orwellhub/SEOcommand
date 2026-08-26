import { describe, expect, it } from "vitest";
import { forecastSiteCost } from "./cost-forecast";

describe("forecastSiteCost", () => {
  it("prices every approved provider workload and exposes an upper ceiling", () => {
    const forecast = forecastSiteCost({
      trackedKeywords: 100,
      crawlMaxPages: 10000,
      backlinkLimit: 10000,
      aiPrompts: 10,
      aiPlatforms: 4,
      devices: ["desktop", "mobile"],
    });
    expect(forecast.lines.map((line) => line.key)).toEqual([
      "daily_rankings",
      "technical_crawl",
      "keyword_competitor_gap",
      "backlink_history",
      "ai_visibility",
    ]);
    expect(forecast.monthlyUsd).toBeGreaterThan(0);
    expect(forecast.highUsd).toBeGreaterThan(forecast.monthlyUsd);
  });

  it("scales daily ranking cost with keywords and devices", () => {
    const one = forecastSiteCost({ trackedKeywords: 50, crawlMaxPages: 1000, backlinkLimit: 1000, aiPrompts: 1, aiPlatforms: 1, devices: ["desktop"] });
    const two = forecastSiteCost({ trackedKeywords: 50, crawlMaxPages: 1000, backlinkLimit: 1000, aiPrompts: 1, aiPlatforms: 1, devices: ["desktop", "mobile"] });
    const rank = (forecast: typeof one) => forecast.lines.find((line) => line.key === "daily_rankings")!.monthlyUsd;
    expect(rank(two)).toBe(rank(one) * 2);
  });
});
