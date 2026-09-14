import { describe, expect, it } from "vitest";
import { clusterSearchResults, money, researchReportLabels, safeEvidenceUrl, trendSummary, type EvidenceReport, type ResearchUnit } from "./research-evidence";
import { normalizeResearch } from "@/providers/dataforseo/research-normalizers";
import { requestCostEstimate } from "@/providers/dataforseo/config";
import { analyseContent, benchmarkHtml } from "./content-analysis";
import { internationalChecks, structuredDataIssues, excludedFromCrawl } from "@/platform/audit-depth";
import { keywordEffort } from "./planning";
import { matchedAiComparison, type ComparableAnswer } from "./ai-comparison";
import { mailMessage } from "@/providers/google/mail";
import { findAcquiredLink } from "@/platform/outreach-monitor";
const unit = (endpoint: string): ResearchUnit => ({ id: "1", endpoint, path: "/unused", body: {}, estimateUsd: .03, label: "example.com" });
describe("research evidence accuracy", () => {
  it("resolves saved numeric country labels without rewriting evidence or merging languages", () => {
    const original: EvidenceReport = { series: [], notes: [], tables: [{ title: "countries", columns: ["Location code", "Language"], total: 3, rows: [
      { id: "a", label: "2124", values: { "Location code": 2124, Language: "en", "Organic traffic": 0 } },
      { id: "b", label: "2124", values: { "Location code": 2124, Language: "fr", "Organic traffic": null } },
      { id: "c", label: "2404", values: { "Location code": 2404, Language: "en", "Organic traffic": 3.905999 } },
    ] }] };
    const saved = JSON.stringify(original);
    const result = researchReportLabels("countries", original)!;
    expect(result.tables[0].rows.map(row => row.label)).toEqual(["Canada", "Canada", "Kenya"]);
    expect(result.tables[0].rows.map(row => row.values["Organic traffic"])).toEqual([0, null, 3.905999]);
    expect(JSON.stringify(original)).toBe(saved);
    expect(researchReportLabels("history", original)).toBe(original);
  });
  it("labels autocomplete markets while retaining the exact provider code", () => {
    const report = normalizeResearch(unit("serpAutocomplete"), [{ location_code: 2826, items: [{ type: "autocomplete", suggestion: "bus rental", rank_absolute: 1 }] }]);
    expect(researchReportLabels("autocomplete", report)?.tables[0].rows[0].values).toMatchObject({ Location: "United Kingdom", "Location code": 2826 });
  });
  it("shows sub-cent costs accurately after a real collection", () => {
    expect(money(.0156)).toBe("$0.0156"); expect(money(.002)).toBe("$0.0020"); expect(money(.15)).toBe("$0.15");
  });
  it("does not turn missing data into zeros", () => { const result = normalizeResearch(unit("labsRankedKeywords"), [{ items: [{ keyword_data: { keyword: "bus hire", keyword_info: { search_volume: 0 } }, ranked_serp_element: { serp_item: { rank_group: 4, url: "https://example.com/" } } }] }]); expect(result.tables[0]!.rows[0]!.values).toEqual({ Position: 4, "Google monthly searches": 0, Difficulty: null, "Estimated traffic": null }); });
  it("normalizes provider monthly AI estimates, not Google volume", () => { const result = normalizeResearch(unit("aiKeywordDemand"), [{ items: [{ keyword: "bus hire", search_volume: 1000, ai_search_volume: 25, ai_monthly_searches: [{ year: 2026, month: 8, ai_search_volume: 20 }] }] }]); expect(result.tables[0]!.rows[0]!.values["Estimated monthly demand"]).toBe(25); expect(result.series[0]!.points).toEqual([{ date: "2026-08-01", value: 20 }]); });
  it("keeps history chronological and missing ranking buckets unavailable", () => { const report = normalizeResearch(unit("labsHistoricalRankOverview"), [{ items: [{ year: 2026, month: 8, metrics: { organic: { etv: 22, pos_1: 2, pos_2_3: 3 } } }, { year: 2026, month: 7, metrics: { organic: { etv: 20 } } }] }]); expect(report.series[0]!.points.map((r) => r.value)).toEqual([20, 22]); expect(report.tables[0]!.rows[1]!.values["Top 10"]).toBeNull(); });
  it("keeps incomplete trend windows unavailable rather than joining gaps", () => { const points = Array.from({ length: 8 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, value: i === 5 ? null : 20 })); expect(trendSummary({ label: "bus", unit: "relative", points }).values["Change %"]).toBeNull(); });
  it("excludes incomplete provider trend periods without losing nulls", () => { const report = normalizeResearch(unit("searchTrends"), [{ keywords: ["bus"], items: [{ type: "dataforseo_trends_graph", data: [{ date_from: "2026-08-01", date_to: "2026-08-07", values: [null] }, { date_from: "2026-09-10", date_to: "2026-09-17", values: [44] }] }] }], new Date("2026-09-10")); expect(report.series[0]!.points).toEqual([{ date: "2026-08-01", value: null }]); });
  it("prevents weak transitive keyword clusters", () => { const urls = (ids: number[]) => ids.map((id) => `https://example.com/${id}`); const rows = clusterSearchResults([{ keyword: "a", urls: urls([1, 2, 3, 4]) }, { keyword: "b", urls: urls([1, 2, 3, 5, 6, 7]) }, { keyword: "c", urls: urls([5, 6, 7, 8]) }]); expect(rows).toHaveLength(2); expect(rows[0]!.keywords).toEqual(["a", "b"]); });
  it("does not infer absent review replies when the field is missing", () => { const report = normalizeResearch(unit("googleReviews"), [{ items: [{ review_id: "1", review_text: "Friendly service", rating: { value: 5 } }, { review_id: "2", review_text: "Late and expensive", rating: { value: 1 }, owner_answer: "" }] }]); expect(report.tables[0]!.rows[0]!.values["Owner reply"]).toBe("Not supplied"); expect(report.tables[1]!.rows.find((r) => r.label === "Speed and reliability")?.values["Low ratings (1–2)"]).toBe(1); });
  it("extracts PAA sources and top ten organic positions", () => { const report = normalizeResearch(unit("researchSerp"), [{ items: [{ type: "organic", rank_group: 1, url: "https://example.com/a" }, { type: "organic", rank_group: 11, url: "https://example.com/b" }, { type: "people_also_ask", items: [{ title: "What is bus hire?", expanded_element: [{ url: "https://example.com/q", description: "Answer" }] }] }] }]); expect(report.tables[0]!.rows).toHaveLength(1); expect(report.tables[1]!.rows[0]!.label).toBe("What is bus hire?"); });
  it("blocks unsafe evidence links", () => { expect(safeEvidenceUrl("javascript:alert(1)")).toBeUndefined(); expect(safeEvidenceUrl("https://user:pass@example.com")).toBeUndefined(); });
  it("scales guard estimates with row count and SERP depth", () => { expect(requestCostEstimate("labsRankedKeywords", [{ limit: 1000 }])).toBeCloseTo(.132); expect(requestCostEstimate("backlinksList", [{ limit: 1000 }])).toBeCloseTo(.06); expect(requestCostEstimate("serpOrganicLive", [{ depth: 100 }])).toBeCloseTo(.03); expect(() => requestCostEstimate("x", [], NaN)).toThrow(); });
});
describe("editor, audit and communication safeguards", () => {
  it("counts whole phrases and missing competitor topics", () => { const result = analyseContent("# Bus hire\n\nBus hire helps groups. Business transport.", ["bus", "bus hire", "business"], [{ url: "https://x.test/", title: "", headings: ["Airport pickup times"], wordCount: 50, capturedAt: "2026-09-10" }]); expect(result.coverage[0]!.occurrences).toBe(2); expect(result.coverage[1]!.inHeading).toBe(true); expect(result.topics[0]!.missing).toBe(true); expect(result.readability).toBeNull(); });
  it("excludes scripts and navigation from comparison word counts", () => { const b = benchmarkHtml('<title>Hello</title><nav>one two</nav><h1>Bus hire</h1><script>one two three</script><p>Useful content here.</p>', "https://x.test/"); expect(b.headings).toEqual(["Bus hire"]); expect(b.wordCount).toBe(6); });
  it("checks reciprocal language links only within the inspected graph", () => { const pages = [{ url: "https://x.test/en", finalUrl: null, canonical: null, statusCode: 200, indexable: true, hreflang: { fr: "https://x.test/fr", de: "https://x.test/de" }, issues: [] as string[] }, { url: "https://x.test/fr", finalUrl: null, canonical: null, statusCode: 404, indexable: false, hreflang: {} as Record<string, string>, issues: [] as string[] }]; expect(internationalChecks(pages)).toEqual({ hreflangChecked: 1, hreflangOutsideCrawl: 1 }); expect(pages[0]!.issues).toContain("hreflang_missing_return_link"); });
  it("checks schema structure without treating unrelated nested objects as typed entities", () => { expect(structuredDataIssues(['{"@context":"https://schema.org","@type":"Product","name":"Bus","offers":{"price":10}}'])).toEqual([]); expect(structuredDataIssues(['{"@type":"Product"}'])).toContain("schema_missing_context"); expect(structuredDataIssues(["bad json"])).toContain("invalid_json_ld"); });
  it("excludes descendants without accidentally excluding similarly named paths", () => { expect(excludedFromCrawl("https://x.test/account/login", ["/account"])).toBe(true); expect(excludedFromCrawl("https://x.test/accounting", ["/account"])).toBe(false); });
  it("requires five measured wins for website effort estimates", () => { expect(keywordEffort([]).baseline).toBeNull(); });
  it("requires prompt, date and sample matches in platform comparisons", () => { const base: ComparableAnswer = { id: "1", prompt: "Bus?", platform: "a", capturedOn: "2026-09-10", capturedAt: "2026-09-10T01:00:00Z", sampleIndex: 0, mentioned: true, cited: false, sentiment: "neutral", responseText: "", responseHash: "a", modelName: "a" }; const result = matchedAiComparison([base, { ...base, id: "2", platform: "b", mentioned: false }, { ...base, id: "3", platform: "b", sampleIndex: 1 }], "a", "b"); expect(result.pairs).toHaveLength(1); expect(result.metrics[1]!.mentionRate).toBe(0); expect(matchedAiComparison([base], "a", "a").pairs).toHaveLength(0); });
  it("rejects email header injection and produces a PDF attachment MIME part", () => { expect(() => mailMessage({ id: "a", from: "from@example.com", to: ["to@example.com"], subject: "x\r\nBcc: other@example.com", text: "hello" })).toThrow(); const message = mailMessage({ id: "a", from: "from@example.com", to: ["to@example.com"], subject: "Report", text: "Hello", attachment: Buffer.from("%PDF") }); expect(message).toContain("Content-Type: application/pdf"); });
  it("does not mistake a lookalike destination for an acquired link", () => { expect(findAcquiredLink('<a href="https://example.com.evil.test/page">x</a>', "https://publisher.test", "https://example.com/page").found).toBe(false); expect(findAcquiredLink('<a href="https://example.com/page" rel="nofollow">x</a>', "https://publisher.test", "https://example.com/page")).toMatchObject({ found: true, nofollow: true }); });
});

import { compareEvidenceDates } from "./research-evidence";
it("compares exact saved dates without turning absent periods or zero baselines into growth", () => {
 const series = { label: "History", unit: "keywords", points: [{ date: "2026-01", value: 0 }, { date: "2026-02", value: 20 }, { date: "2026-03", value: null }] };
 expect(compareEvidenceDates(series, "2026-01", "2026-02")).toEqual({ before: 0, after: 20, change: 20, percent: null });
 expect(compareEvidenceDates(series, "2026-02", "2026-03").change).toBeNull();
 expect(compareEvidenceDates(series, "2025-01", "2026-02").before).toBeNull();
});
