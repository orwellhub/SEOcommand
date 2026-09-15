import { describe, expect, it } from "vitest";
import { normalizeSavedSnapshot } from "./snapshot-quality";
import { analyticsPeriod, searchPeriod } from "./reporting";
import { sourceHealth } from "./source-health";
import { aggregateBundles } from "@/sync/aggregate";
import { normalizeBacklinks, normalizeReferringDomains, normalizeRankedKeywords, normalizeDomainOverview, normalizeCompetitors } from "@/providers/dataforseo/normalizers";
import type { DomainLiveBundle } from "./live";
import type { Provenance } from "./types";
import { shiftDate } from "./dashboard-data";

const provenance = { source: "google-search-console", mode: "live", collectedAt: "2026-09-10T06:00:00Z", rangeStart: "2026-08-13", rangeEnd: "2026-09-10" } as Provenance;
const point = (date: string, clicks: number) => ({ date, clicks, impressions: clicks * 10, position: 5, ctr: 10 });
function bundle(domainId: string, datasets: DomainLiveBundle["datasets"]): DomainLiveBundle { return { domainId, lastSync: provenance.collectedAt, datasets }; }
function ds<T>(data: T, p = provenance) { return { data, provenance: p, capturedOn: "2026-09-10" }; }

describe("production accuracy regressions", () => {
  it("uses competitor-wide metrics, preserving zero and withholding unsupported scores and trends", () => {
    const rows = normalizeCompetitors([{items:[
      {domain:"competitor.example",intersections:45,metrics:{organic:{count:45,etv:30}},full_domain_metrics:{organic:{count:900,etv:1234.4}}},
      {domain:"zero.example",intersections:0,full_domain_metrics:{organic:{count:0,etv:0}}},
      {domain:"unknown.example",metrics:{organic:{count:45,etv:30}}},
    ]}], "a");
    expect(rows[0]).toMatchObject({commonKeywords:45,keywords:900,estTraffic:1234,overlapPct:5,authority:null,trend:null,metricsVersion:2});
    expect(rows[1]).toMatchObject({commonKeywords:0,keywords:0,estTraffic:0,overlapPct:null});
    expect(rows[2]).toMatchObject({commonKeywords:null,keywords:null,estTraffic:null,authority:null,trend:null});
  });
  it("withholds incorrect legacy competitor totals on read without modifying saved evidence", () => {
    const old = {host:"competitor.example",commonKeywords:45,keywords:45,estTraffic:30,authority:0,overlapPct:100,trend:"flat"};
    const saved = {dataset:"competitors",payload:[old,{...old,metricsVersion:2}],provenance:{...provenance,source:"dataforseo"} as Provenance};
    expect(normalizeSavedSnapshot(saved).payload[0]).toMatchObject({commonKeywords:45,keywords:null,estTraffic:null,authority:null,overlapPct:null,trend:null});
    expect(normalizeSavedSnapshot(saved).payload[1]).toEqual(saved.payload[1]);
    expect(saved.payload[0]).toEqual(old);
  });
  it("corrects only the known historical Search Console date signature without changing stored records", () => {
    const saved = { dataset: "gsc_totals", payload: { clicks: 212 }, provenance };
    expect(normalizeSavedSnapshot(saved).provenance).toMatchObject({ rangeStart: "2026-08-12", rangeEnd: "2026-09-08" });
    expect(saved.provenance.rangeEnd).toBe("2026-09-10");
    expect(normalizeSavedSnapshot({ ...saved, provenance: { ...provenance, normalizationVersion: 2 } })).toEqual({ ...saved, provenance: { ...provenance, normalizationVersion: 2 } });
    expect(normalizeSavedSnapshot({ ...saved, provenance: { ...provenance, source: "google-analytics" } }).provenance.rangeEnd).toBe("2026-09-10");
  });
  it("does not rewind the portfolio to a stale property and uses the same cohort for both periods", () => {
    const rows = Array.from({ length: 56 }, (_, index) => point(shiftDate("2026-07-14", index), index < 28 ? 1 : 2));
    const result = aggregateBundles([bundle("current", { gsc_timeseries: ds(rows) }), bundle("stale", { gsc_timeseries: ds(rows.slice(0, 30).map((row) => ({ ...row, clicks: 100 }))) }), bundle("missing", {})]);
    const period = searchPeriod(result);
    expect(period).toMatchObject({ end: "2026-09-07", comparable: true, clickChange: 100 });
    expect(period.total?.clicks).toBe(56);
    expect(result.datasets.gsc_timeseries?.includedDomains).toBe(1);
    expect(result.datasets.gsc_timeseries?.coverage?.find((site) => site.domainId === "stale")).toMatchObject({ end: "2026-08-12", included: false });
  });
  it("excludes stale page/query breakdowns and movers from a current portfolio report", () => {
    const stale = { ...provenance, rangeStart: "2026-07-24", rangeEnd: "2026-08-21" };
    const row = { key: "page", clicks: 10, impressions: 100, ctr: 10, position: 5 };
    const current = bundle("a", { gsc_pages: ds([row]), gsc_movers: ds({ gains: [{ key: "query", change: 3 } as never], losses: [] }) });
    const old = bundle("old", { gsc_pages: ds([{ ...row, clicks: 999 }], stale), gsc_movers: ds({ gains: [{ key: "old", change: 999 } as never], losses: [] }, stale) });
    expect(aggregateBundles([current, old]).datasets.gsc_pages?.data).toEqual([row]);
    expect(aggregateBundles([current, old]).datasets.gsc_movers?.data.gains.map((row) => row.key)).toEqual(["query"]);
  });
  it("keeps successful zero-activity GA4 properties from erasing another property's daily totals", () => {
    const data = { startDate: "2026-03-14", endDate: "2026-09-09", breakdownStartDate: "2026-08-13", domainIds: ["a"], series: [{ date: "2026-09-09", sessions: 12, engagedSessions: 9, views: 20, conversions: 2 }], countries: [], pages: [], completeDateRange: true };
    const merged = aggregateBundles([bundle("a", { ga4_dashboard: ds(data) }), bundle("b", { ga4_dashboard: ds({ ...data, domainIds: ["b"], series: [] }) })]);
    expect(analyticsPeriod(merged, 28)).toMatchObject({ availableDays: 28, snapshotOnly: false, end: "2026-09-09", total: { sessions: 12, conversions: 2 } });
    expect(analyticsPeriod(bundle("zero", { ga4_dashboard: ds({ ...data, series: [] }) }), 7).total?.sessions).toBe(0);
  });
  it("never substitutes a 29-day Analytics snapshot for a requested 7-day period", () => {
    expect(analyticsPeriod(bundle("a", { ga4_overview: ds({ sessions: 20, totalUsers: 18, newUsers: 8, engagedSessions: 10, engagementRate: 50, conversions: 3, screenPageViews: 30 }) }), 7).total).toBeNull();
  });
  it("does not let fresh Analytics conceal stale Search Console and audit data", () => {
    const old = { ...provenance, collectedAt: "2026-08-21T06:00:00Z" };
    const health = sourceHealth(bundle("a", { gsc_timeseries: ds([point("2026-08-18", 2)], old), ga4_overview: ds({ sessions: 1 } as never), onpage: ds({ healthScore: 99 } as never, { ...old, collectedAt: "2026-07-22T06:00:00Z" }) }), Date.parse("2026-09-10T12:00:00Z"));
    expect(health.find((row) => row.label === "Search Console")?.state).toBe("stale");
    expect(health.find((row) => row.label === "Site audit")?.state).toBe("stale");
    expect(health.find((row) => row.label === "Google Analytics")?.state).toBe("ready");
  });
  it("treats DataForSEO items:null as zero results instead of a phantom keyword or backlink", () => {
    const raw = [{ total_count: 0, items_count: 0, items: null }];
    expect(normalizeBacklinks(raw, "a")).toEqual([]);
    expect(normalizeReferringDomains(raw, "a")).toEqual([]);
    expect(normalizeRankedKeywords(raw, "a")).toEqual([]);
    const saved = { dataset: "referring_domains", payload: [{ host: "", backlinks: 0 }], provenance };
    expect(normalizeSavedSnapshot(saved).payload).toEqual([]);
    expect(saved.payload).toHaveLength(1);
  });
  it("preserves unknown previous rankings rather than manufacturing no change", () => {
    const raw = [{ items: [{ keyword_data: { keyword: "mortgage" }, ranked_serp_element: { serp_item: { rank_absolute: 6 } } }] }];
    expect(normalizeRankedKeywords(raw, "a")[0].prevPosition).toBeNull();
    expect(normalizeDomainOverview([{ metrics: { organic: { count: 5, pos_1: 1 } } }]).buckets.every((row) => row.prevCount === null)).toBe(true);
  });
});
