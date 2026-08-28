import { describe, expect, it } from "vitest";
import {
  assessCollection,
  aiStaleAfterDays,
  COLLECTION_POLICIES,
  earliestDate,
  nextDailyCollection,
  nextWeeklyCollection,
  validateCollectionEvidence,
} from "./collection-health";

describe("collection health", () => {
  const now = new Date("2026-08-28T09:00:00Z");

  it("distinguishes unconfigured, warming, ready and stale histories", () => {
    const policy = COLLECTION_POLICIES.rankings;
    expect(assessCollection(policy, { configured: false, records: 0, distinctDates: 0, observedAt: null }, now).state).toBe("not_configured");
    expect(assessCollection(policy, { configured: true, records: 20, distinctDates: 1, observedAt: "2026-08-28" }, now).state).toBe("warming");
    expect(assessCollection(policy, { configured: true, records: 40, distinctDates: 2, observedAt: "2026-08-28" }, now).state).toBe("ready");
    expect(assessCollection(policy, { configured: true, records: 40, distinctDates: 2, observedAt: "2026-08-24" }, now).state).toBe("stale");
  });

  it("makes validation failure override apparently complete history", () => {
    const item = assessCollection(COLLECTION_POLICIES.coverage, {
      configured: true,
      records: 100,
      distinctDates: 4,
      observedAt: "2026-08-28",
      validationIssues: [{ dataset: "coverage", code: "invalid_gap", count: 1, detail: "Bad gap." }],
    }, now);
    expect(item.state).toBe("failed");
    expect(item.confidence).toBe("low");
  });

  it("calculates the next 06:00 UTC daily and Monday schedules", () => {
    expect(nextDailyCollection(now).toISOString()).toBe("2026-08-29T06:00:00.000Z");
    expect(nextWeeklyCollection(now).toISOString()).toBe("2026-08-31T06:00:00.000Z");
    expect(nextWeeklyCollection(new Date("2026-08-31T05:00:00Z")).toISOString()).toBe("2026-08-31T06:00:00.000Z");
    expect(nextWeeklyCollection(new Date("2026-08-31T07:00:00Z")).toISOString()).toBe("2026-09-07T06:00:00.000Z");
  });

  it("uses the earliest AI prompt due time and cadence-specific staleness", () => {
    expect(earliestDate(["2026-09-10T06:00:00Z", "2026-08-31T06:00:00Z", null])).toBe("2026-08-31T06:00:00Z");
    expect(aiStaleAfterDays(["monthly", "daily"])).toBe(2);
    expect(aiStaleAfterDays(["monthly", "weekly"])).toBe(9);
    expect(aiStaleAfterDays(["monthly"])).toBe(35);
  });

  it("flags raw provider evidence outside accepted bounds", () => {
    const issues = validateCollectionEvidence({
      rankings: [
        { trackedKeywordId: "one", capturedOn: "2026-08-28", position: 0, previousPosition: null, competitors: [] },
        { trackedKeywordId: "one", capturedOn: "2026-08-28", position: 3, previousPosition: 4, competitors: [] },
      ],
      competitors: [{ pages: [{ url: "javascript:bad", traffic: -1 }] }],
      gaps: [{ sitePosition: null, competitorPosition: 101, volume: -2, difficulty: 140, trafficPotential: 1 }],
      links: [{ sourceDomain: "", relevance: 110, authority: -1 }],
      ai: [{ confidence: 1.2, recommendationPosition: 0, costUsd: -0.1, responseHash: "" }],
    });
    expect(issues.map((item) => item.code)).toEqual([
      "duplicate_observation",
      "invalid_position",
      "invalid_page",
      "invalid_gap",
      "invalid_link",
      "invalid_ai_observation",
    ]);
  });

  it("accepts well-formed stored evidence", () => {
    expect(validateCollectionEvidence({
      rankings: [{ trackedKeywordId: "one", capturedOn: "2026-08-28", position: null, previousPosition: 12, competitors: [{ position: 3 }] }],
      competitors: [{ pages: [{ url: "https://example.com/page", traffic: 0, keywords: 2, trafficCost: null }] }],
      gaps: [{ sitePosition: null, competitorPosition: 8, volume: 10, difficulty: 42, trafficPotential: 2 }],
      links: [{ sourceDomain: "publisher.example", relevance: 80, authority: 65 }],
      ai: [{ confidence: 0.8, recommendationPosition: null, costUsd: 0.04, responseHash: "hash" }],
    })).toEqual([]);
  });
});
