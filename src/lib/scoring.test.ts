import { describe, it, expect } from "vitest";
import { computeAuthorityScore, computeHealthScore } from "./scoring";
import type { Backlink, HealthBreakdown, ReferringDomain } from "./types";

const breakdown = (rows: [number, number][]): HealthBreakdown[] =>
  rows.map(([weight, score], i) => ({ category: `c${i}`, weight, score, issues: 0 }));

describe("computeHealthScore", () => {
  it("is the weighted average of category scores", () => {
    expect(computeHealthScore(breakdown([[0.5, 80], [0.5, 60]]))).toBe(70);
  });
  it("normalises when weights do not sum to 1 and handles empty input", () => {
    expect(computeHealthScore(breakdown([[0.2, 90], [0.2, 70]]))).toBe(80);
    expect(computeHealthScore([])).toBe(0);
  });
});

function rd(authority: number, topicalRelevance: number): ReferringDomain {
  return {
    id: "r",
    domainId: "d",
    host: "example.com",
    authority,
    backlinks: 1,
    firstSeen: "2026-01-01",
    follow: true,
    topicalRelevance,
  };
}

function bl(sourceDomain: string, toxicity: number): Backlink {
  return {
    id: "b",
    domainId: "d",
    sourceDomain,
    sourceUrl: `https://${sourceDomain}/x`,
    targetUrl: "https://site.com/",
    anchor: "a",
    authority: 50,
    follow: true,
    firstSeen: "2026-01-01",
    lastSeen: "2026-01-02",
    status: "active",
    toxicity,
  };
}

describe("computeAuthorityScore", () => {
  it("returns 0 with no link data", () => {
    expect(computeAuthorityScore([], [], 50)).toBe(0);
  });
  it("rewards authority/relevance/diversity/visibility and penalises toxicity", () => {
    const clean = computeAuthorityScore(
      [rd(80, 90), rd(70, 80)],
      [bl("a.com", 0), bl("b.com", 0), bl("c.com", 0)],
      60,
    );
    const toxic = computeAuthorityScore(
      [rd(80, 90), rd(70, 80)],
      [bl("a.com", 90), bl("b.com", 90), bl("c.com", 90)],
      60,
    );
    expect(clean).toBeGreaterThan(toxic);
    expect(clean).toBeLessThanOrEqual(100);
    expect(toxic).toBeGreaterThanOrEqual(0);
  });
});
