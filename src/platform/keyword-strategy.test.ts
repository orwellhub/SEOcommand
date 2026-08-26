import { describe, expect, it } from "vitest";
import type { GscQueryPageRow, Keyword } from "@/lib/types";
import { analyseKeywordStrategy } from "./keyword-strategy";

function keyword(overrides: Partial<Keyword> & Pick<Keyword, "id" | "keyword">): Keyword {
  return {
    domainId: "orwell" as Keyword["domainId"],
    location: "United Kingdom",
    intent: "commercial",
    volume: 1_000,
    difficulty: 40,
    cpc: 1,
    competition: 0.5,
    position: 12,
    prevPosition: 14,
    competitorPositions: {},
    trafficPotential: 100,
    serpFeatures: [],
    trend: [],
    targetUrl: null,
    ...overrides,
  };
}

function queryPage(query: string, page: string, impressions: number, clicks: number, position: number): GscQueryPageRow {
  return { key: `${query}:${page}`, query, page, impressions, clicks, position, ctr: impressions ? clicks / impressions : 0 };
}

describe("advanced keyword strategy", () => {
  it("builds intent-aware clusters and keeps the dominant landing page", () => {
    const result = analyseKeywordStrategy([
      keyword({ id: "1", keyword: "enterprise seo software", volume: 2_000, targetUrl: "https://example.com/seo" }),
      keyword({ id: "2", keyword: "enterprise seo platform", volume: 1_000, targetUrl: "https://example.com/seo" }),
      keyword({ id: "3", keyword: "enterprise seo pricing", intent: "transactional", targetUrl: "https://example.com/pricing" }),
    ], []);

    expect(result.clusters).toHaveLength(2);
    expect(result.clusters.find((cluster) => cluster.intent === "commercial")).toMatchObject({
      totalVolume: 3_000,
      targetUrl: "https://example.com/seo",
    });
  });

  it("maps query demand to pages using impression-weighted position", () => {
    const result = analyseKeywordStrategy([], [
      queryPage("seo platform", "https://example.com/seo", 100, 20, 5),
      queryPage("seo software", "https://example.com/seo", 300, 15, 15),
    ]);

    expect(result.pageMap[0]).toMatchObject({
      page: "https://example.com/seo",
      primaryQuery: "seo platform",
      clicks: 35,
      impressions: 400,
      averagePosition: 12.5,
    });
  });

  it("flags only material multi-page cannibalisation", () => {
    const result = analyseKeywordStrategy([], [
      queryPage("seo audit", "https://example.com/a", 800, 30, 6),
      queryPage("seo audit", "https://example.com/b", 300, 5, 18),
      queryPage("tiny query", "https://example.com/a", 9, 0, 40),
      queryPage("tiny query", "https://example.com/b", 8, 0, 50),
    ]);

    expect(result.cannibalisation).toHaveLength(1);
    expect(result.cannibalisation[0]).toMatchObject({ query: "seo audit", totalImpressions: 1_100, severity: "high" });
  });
});
