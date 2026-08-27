import { describe, expect, it } from "vitest";
import { buildSerpIntelligence, type SerpHistoryRow } from "./serp-intelligence";
const row = (patch: Partial<SerpHistoryRow>): SerpHistoryRow => ({ trackedKeywordId: "k1", keyword: "compare mortgages", capturedOn: "2026-08-01", position: 8, previousPosition: 10, url: "/page", serpFeatures: ["organic", "featured_snippet"], ownedFeatures: [], intent: "commercial", competitors: [{ host: "one.example", position: 1, url: null }], device: "desktop", locationCode: 2784, ...patch });
describe("SERP intelligence", () => {
  it("detects intent, feature and competitor changes", () => { const result = buildSerpIntelligence([row({}), row({ capturedOn: "2026-08-08", position: 2, previousPosition: 8, intent: "transactional", ownedFeatures: ["featured_snippet"], competitors: [{ host: "two.example", position: 1, url: null }] })]); expect(result.alerts.map((item) => item.type)).toEqual(expect.arrayContaining(["intent_change", "feature_change", "competitor_takeover", "volatility"])); expect(result.keywords[0]?.change).toBe(6); });
});
