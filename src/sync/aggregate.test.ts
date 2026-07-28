import { describe, it, expect } from "vitest";
import { aggregateBundles } from "./aggregate";
import type { DomainLiveBundle } from "@/lib/live";
import type { Provenance } from "@/lib/types";

const prov = { source: "google-search-console", mode: "live" } as unknown as Provenance;

function ds<T>(data: T, capturedOn = "2026-07-01") {
  return { data, capturedOn, provenance: prov };
}

/** Test bundles carry only the fields each case needs, so datasets is loose. */
function bundle(domainId: string, datasets: Record<string, unknown>): DomainLiveBundle {
  return {
    domainId,
    lastSync: "2026-07-01T00:00:00Z",
    datasets: datasets as DomainLiveBundle["datasets"],
  };
}

describe("aggregateBundles", () => {
  it("returns an empty portfolio bundle when nothing has synced", () => {
    const out = aggregateBundles([]);
    expect(out.domainId).toBe("portfolio");
    expect(out.datasets).toEqual({});
    expect(out.lastSync).toBeNull();
  });

  it("sums clicks/impressions and recomputes CTR rather than averaging it", () => {
    const out = aggregateBundles([
      bundle("a", { gsc_totals: ds({ clicks: 100, impressions: 1000, ctr: 10, position: 5 }) }),
      bundle("b", { gsc_totals: ds({ clicks: 50, impressions: 9000, ctr: 0.56, position: 30 }) }),
    ]);
    const t = out.datasets.gsc_totals!.data;
    expect(t.clicks).toBe(150);
    expect(t.impressions).toBe(10000);
    // 150/10000 = 1.5% — NOT the mean of 10 and 0.56.
    expect(t.ctr).toBe(1.5);
  });

  it("weights average position by impressions", () => {
    const out = aggregateBundles([
      bundle("a", { gsc_totals: ds({ clicks: 0, impressions: 1000, ctr: 0, position: 10 }) }),
      bundle("b", { gsc_totals: ds({ clicks: 0, impressions: 9000, ctr: 0, position: 20 }) }),
    ]);
    // (10*1000 + 20*9000) / 10000 = 19 — a plain mean would give 15.
    expect(out.datasets.gsc_totals!.data.position).toBe(19);
  });

  it("concatenates row collections across domains", () => {
    const out = aggregateBundles([
      bundle("a", { gsc_queries: ds([{ key: "x", clicks: 1, impressions: 2, ctr: 50, position: 1 }]) }),
      bundle("b", { gsc_queries: ds([{ key: "y", clicks: 3, impressions: 4, ctr: 75, position: 2 }]) }),
    ]);
    expect(out.datasets.gsc_queries!.data).toHaveLength(2);
  });

  it("sums position buckets by label", () => {
    const out = aggregateBundles([
      bundle("a", { position_buckets: ds([{ label: "1-3", count: 5, prevCount: 4 }]) }),
      bundle("b", { position_buckets: ds([{ label: "1-3", count: 7, prevCount: 1 }]) }),
    ]);
    expect(out.datasets.position_buckets!.data).toEqual([{ label: "1-3", count: 12, prevCount: 5 }]);
  });

  it("merges onpage issues and averages health", () => {
    const out = aggregateBundles([
      bundle("a", {
        onpage: ds({
          breakdown: [{ category: "Metadata", weight: 0.1, score: 80, issues: 2 }],
          crawlRun: null,
          issues: [{ id: "1" }, { id: "2" }],
          healthScore: 80,
        }),
      }),
      bundle("b", {
        onpage: ds({
          breakdown: [{ category: "Metadata", weight: 0.1, score: 60, issues: 3 }],
          crawlRun: null,
          issues: [{ id: "3" }],
          healthScore: 60,
        }),
      }),
    ]);
    const op = out.datasets.onpage!.data;
    expect(op.issues).toHaveLength(3);
    expect(op.healthScore).toBe(70);
    expect(op.breakdown[0]).toMatchObject({ category: "Metadata", score: 70, issues: 5 });
  });

  it("sums timeseries per date across domains", () => {
    const out = aggregateBundles([
      bundle("a", { gsc_timeseries: ds([{ date: "2026-07-01", clicks: 10, impressions: 100, ctr: 10, position: 5 }]) }),
      bundle("b", { gsc_timeseries: ds([{ date: "2026-07-01", clicks: 5, impressions: 100, ctr: 5, position: 15 }]) }),
    ]);
    const pts = out.datasets.gsc_timeseries!.data;
    expect(pts).toHaveLength(1);
    expect(pts[0]!.clicks).toBe(15);
    expect(pts[0]!.position).toBe(10); // impression-weighted
  });

  it("recomputes share of market from summed components", () => {
    const base = {
      windowDays: 28,
      keywordCount: 10,
      availableMonthlyClicks: 0,
      baselined: null,
    };
    const out = aggregateBundles([
      bundle("a", {
        share_of_market: ds({
          ...base,
          site: "a",
          measuredClicks: 100,
          measuredImpressions: 1000,
          monthlySearchVolume: 0,
          availableClicksInWindow: 1000,
          shareOfAvailableClicksPct: 10,
          impressionShareOfDemandPct: 0,
        }),
      }),
      bundle("b", {
        share_of_market: ds({
          ...base,
          site: "b",
          measuredClicks: 100,
          measuredImpressions: 1000,
          monthlySearchVolume: 0,
          availableClicksInWindow: 3000,
          shareOfAvailableClicksPct: 3.33,
          impressionShareOfDemandPct: 0,
        }),
      }),
    ]);
    const som = out.datasets.share_of_market!.data!;
    expect(som.measuredClicks).toBe(200);
    expect(som.availableClicksInWindow).toBe(4000);
    expect(som.shareOfAvailableClicksPct).toBe(5); // 200/4000, not (10+3.33)/2
  });

  it("omits datasets that no domain has, so empty states still render", () => {
    const out = aggregateBundles([bundle("a", { gsc_totals: ds({ clicks: 1, impressions: 1, ctr: 100, position: 1 }) })]);
    expect("backlinks" in out.datasets).toBe(false);
    expect("onpage" in out.datasets).toBe(false);
  });
});
