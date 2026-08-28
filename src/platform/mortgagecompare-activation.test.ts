import { describe, expect, it } from "vitest";
import { MORTGAGECOMPARE_ACTIVATION_COHORT } from "./mortgagecompare-activation";

describe("MortgageCompare production activation cohort", () => {
  it("contains three comparable, uniquely targeted refreshes", () => {
    expect(MORTGAGECOMPARE_ACTIVATION_COHORT).toHaveLength(3);
    expect(new Set(MORTGAGECOMPARE_ACTIVATION_COHORT.map((item) => item.findingKey)).size).toBe(3);
    expect(new Set(MORTGAGECOMPARE_ACTIVATION_COHORT.map((item) => item.targetUrl)).size).toBe(3);
    expect(MORTGAGECOMPARE_ACTIVATION_COHORT.every((item) => item.targetKeywords.length >= 5)).toBe(true);
  });

  it("retains the approved live-evidence cohort totals", () => {
    const totals = MORTGAGECOMPARE_ACTIVATION_COHORT.reduce((sum, item) => ({
      clicks: sum.clicks + item.evidence.clicks,
      impressions: sum.impressions + item.evidence.impressions,
    }), { clicks: 0, impressions: 0 });
    expect(totals).toEqual({ clicks: 10, impressions: 3177 });
  });
});
