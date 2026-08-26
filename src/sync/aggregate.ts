import type {
  AiPrompt,
  Backlink,
  Competitor,
  Ga4ChannelRow,
  Ga4LandingPage,
  Ga4Overview,
  GscMover,
  GscRow,
  GscTotals,
  HealthBreakdown,
  Keyword,
  PositionBucket,
  Provenance,
  RankSnapshot,
  ReferringDomain,
  ShareOfMarket,
  StrikingDistanceRow,
  TechnicalIssue,
} from "@/lib/types";
import type {
  DerivedRecommendation,
  DomainLiveBundle,
  DS,
  GscTimeseriesPoint,
  OnPageResult,
} from "@/lib/live";
import type { BacklinkHistoryPoint, KeywordGapRow } from "@/platform/types";

/**
 * Portfolio aggregation.
 *
 * Merges every domain's live bundle into ONE bundle shaped exactly like a
 * single-domain bundle, so module pages can render portfolio-wide totals
 * without branching. Previously a "Portfolio" selection silently rendered the
 * first domain's data; now it renders the real combination.
 *
 * Merge rules: additive metrics sum, rates/positions are recomputed from the
 * summed components (never averaged averages), and row collections concatenate
 * with their originating domain preserved.
 */

/* ------------------------------ helpers -------------------------------- */

function pickDs<T>(bundles: DomainLiveBundle[], key: keyof DomainLiveBundle["datasets"]): DS<T>[] {
  return bundles
    .map((b) => b.datasets[key] as DS<T> | undefined)
    .filter((d): d is DS<T> => d !== undefined && d.data !== undefined && d.data !== null);
}

/** Newest capturedOn across the merged parts, with an aggregate provenance. */
function envelope<T>(parts: DS<unknown>[], data: T): DS<T> {
  let capturedOn = "";
  let provenance: Provenance | undefined;
  for (const p of parts) {
    if (!capturedOn || p.capturedOn > capturedOn) {
      capturedOn = p.capturedOn;
      provenance = p.provenance;
    }
  }
  return {
    data,
    capturedOn,
    provenance: provenance ?? ({ source: "dataforseo", mode: "live" } as Provenance),
  };
}

function concatDs<T>(
  bundles: DomainLiveBundle[],
  key: keyof DomainLiveBundle["datasets"],
): DS<T[]> | undefined {
  const parts = pickDs<T[]>(bundles, key);
  if (parts.length === 0) return undefined;
  return envelope(parts, parts.flatMap((p) => p.data ?? []));
}

function sumBy<T>(rows: T[], value: (r: T) => number): number {
  return rows.reduce((acc, r) => acc + (Number.isFinite(value(r)) ? value(r) : 0), 0);
}

/* ------------------------------ mergers -------------------------------- */

/** Clicks/impressions sum; CTR and average position are recomputed, not averaged. */
function mergeGscTotals(bundles: DomainLiveBundle[]): DS<GscTotals> | undefined {
  const parts = pickDs<GscTotals>(bundles, "gsc_totals");
  if (parts.length === 0) return undefined;
  const rows = parts.map((p) => p.data);
  const clicks = sumBy(rows, (r) => r.clicks);
  const impressions = sumBy(rows, (r) => r.impressions);
  // Impression-weighted mean position — an unweighted mean would let a tiny
  // property distort the portfolio figure.
  const weighted = sumBy(rows, (r) => r.position * r.impressions);
  return envelope(parts, {
    clicks,
    impressions,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    position: impressions ? Math.round((weighted / impressions) * 10) / 10 : 0,
  });
}

function mergeGa4Overview(bundles: DomainLiveBundle[]): DS<Ga4Overview> | undefined {
  const parts = pickDs<Ga4Overview>(bundles, "ga4_overview");
  if (parts.length === 0) return undefined;
  const rows = parts.map((p) => p.data);
  const sessions = sumBy(rows, (r) => r.sessions);
  const engaged = sumBy(rows, (r) => r.engagedSessions);
  return envelope(parts, {
    sessions,
    totalUsers: sumBy(rows, (r) => r.totalUsers),
    newUsers: sumBy(rows, (r) => r.newUsers),
    engagedSessions: engaged,
    engagementRate: sessions ? Math.round((engaged / sessions) * 10000) / 100 : 0,
    conversions: sumBy(rows, (r) => r.conversions),
    screenPageViews: sumBy(rows, (r) => r.screenPageViews),
  });
}

/** Bucket counts sum across domains, keyed by label. */
function mergePositionBuckets(bundles: DomainLiveBundle[]): DS<PositionBucket[]> | undefined {
  const parts = pickDs<PositionBucket[]>(bundles, "position_buckets");
  if (parts.length === 0) return undefined;
  const byLabel = new Map<string, PositionBucket>();
  const order: string[] = [];
  for (const part of parts) {
    for (const b of part.data ?? []) {
      const existing = byLabel.get(b.label);
      if (existing) {
        existing.count += b.count;
        existing.prevCount += b.prevCount;
      } else {
        byLabel.set(b.label, { ...b });
        order.push(b.label);
      }
    }
  }
  return envelope(parts, order.map((l) => byLabel.get(l)!));
}

/** Timeseries points sum per date; position is impression-weighted. */
function mergeTimeseries(bundles: DomainLiveBundle[]): DS<GscTimeseriesPoint[]> | undefined {
  const parts = pickDs<GscTimeseriesPoint[]>(bundles, "gsc_timeseries");
  if (parts.length === 0) return undefined;
  const byDate = new Map<string, { clicks: number; impressions: number; weighted: number }>();
  for (const part of parts) {
    for (const p of part.data ?? []) {
      const acc = byDate.get(p.date) ?? { clicks: 0, impressions: 0, weighted: 0 };
      acc.clicks += p.clicks;
      acc.impressions += p.impressions;
      acc.weighted += p.position * p.impressions;
      byDate.set(p.date, acc);
    }
  }
  const data = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({
      date,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr: a.impressions ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
      position: a.impressions ? Math.round((a.weighted / a.impressions) * 10) / 10 : 0,
    }));
  return envelope(parts, data);
}

/** Visibility is an index, so the portfolio value is the mean per date. */
function mergeVisibility(
  bundles: DomainLiveBundle[],
): DS<{ date: string; value: number }[]> | undefined {
  const parts = pickDs<{ date: string; value: number }[]>(bundles, "visibility_series");
  if (parts.length === 0) return undefined;
  const byDate = new Map<string, { total: number; n: number }>();
  for (const part of parts) {
    for (const p of part.data ?? []) {
      const acc = byDate.get(p.date) ?? { total: 0, n: 0 };
      acc.total += p.value;
      acc.n += 1;
      byDate.set(p.date, acc);
    }
  }
  const data = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({ date, value: Math.round((a.total / a.n) * 10) / 10 }));
  return envelope(parts, data);
}

/** Issues concatenate; health is the mean score; breakdown merges by category. */
function mergeOnPage(bundles: DomainLiveBundle[]): DS<OnPageResult> | undefined {
  const parts = pickDs<OnPageResult>(bundles, "onpage");
  if (parts.length === 0) return undefined;
  const rows = parts.map((p) => p.data);
  const issues: TechnicalIssue[] = rows.flatMap((r) => r.issues ?? []);

  const byCategory = new Map<string, { weight: number; total: number; n: number; issues: number }>();
  const order: string[] = [];
  for (const r of rows) {
    for (const b of r.breakdown ?? []) {
      const acc = byCategory.get(b.category);
      if (acc) {
        acc.total += b.score;
        acc.n += 1;
        acc.issues += b.issues;
      } else {
        byCategory.set(b.category, { weight: b.weight, total: b.score, n: 1, issues: b.issues });
        order.push(b.category);
      }
    }
  }
  const breakdown: HealthBreakdown[] = order.map((category) => {
    const a = byCategory.get(category)!;
    return {
      category,
      weight: a.weight,
      score: Math.round(a.total / a.n),
      issues: a.issues,
    };
  });

  const scored = rows.filter((r) => Number.isFinite(r.healthScore));
  const healthScore = scored.length
    ? Math.round(sumBy(scored, (r) => r.healthScore) / scored.length)
    : 0;

  const runs = rows.map((r) => r.crawlRun).filter((c): c is NonNullable<typeof c> => c != null);
  const crawlRun = runs.length
    ? {
        ...runs[0]!,
        id: "portfolio-crawl",
        pagesCrawled: sumBy(runs, (r) => r.pagesCrawled),
        healthScore,
        newIssues: sumBy(runs, (r) => r.newIssues),
        resolvedIssues: sumBy(runs, (r) => r.resolvedIssues),
        completedAt: runs.reduce((acc, r) => (r.completedAt > acc ? r.completedAt : acc), ""),
        status: runs.some((r) => r.status === "running") ? ("running" as const) : ("completed" as const),
      }
    : null;

  return envelope(parts, { breakdown, crawlRun, issues, healthScore });
}

/** Portfolio share of market: sum the components, then recompute the shares. */
function mergeShareOfMarket(bundles: DomainLiveBundle[]): DS<ShareOfMarket | null> | undefined {
  const parts = pickDs<ShareOfMarket | null>(bundles, "share_of_market");
  const rows = parts.map((p) => p.data).filter((r): r is ShareOfMarket => r != null);
  if (rows.length === 0) return undefined;
  const measuredClicks = sumBy(rows, (r) => r.measuredClicks);
  const measuredImpressions = sumBy(rows, (r) => r.measuredImpressions);
  const availableClicksInWindow = sumBy(rows, (r) => r.availableClicksInWindow);
  const monthlySearchVolume = sumBy(rows, (r) => r.monthlySearchVolume);
  const windowDays = rows[0]!.windowDays;
  const demandInWindow = monthlySearchVolume * (windowDays / 30);
  return envelope(parts, {
    site: `Portfolio (${rows.length} ${rows.length === 1 ? "site" : "sites"})`,
    windowDays,
    measuredClicks,
    measuredImpressions,
    keywordCount: sumBy(rows, (r) => r.keywordCount),
    monthlySearchVolume,
    availableMonthlyClicks: sumBy(rows, (r) => r.availableMonthlyClicks),
    availableClicksInWindow,
    shareOfAvailableClicksPct: availableClicksInWindow
      ? Math.round((measuredClicks / availableClicksInWindow) * 10000) / 100
      : 0,
    impressionShareOfDemandPct: demandInWindow
      ? Math.round((measuredImpressions / demandInWindow) * 10000) / 100
      : 0,
    baselined: rows[0]!.baselined,
  });
}

function mergeMovers(
  bundles: DomainLiveBundle[],
  key: "gsc_movers" | "gsc_page_movers",
): DS<{ gains: GscMover[]; losses: GscMover[] }> | undefined {
  const parts = pickDs<{ gains: GscMover[]; losses: GscMover[] }>(bundles, key);
  if (parts.length === 0) return undefined;
  return envelope(parts, {
    gains: parts.flatMap((p) => p.data?.gains ?? []),
    losses: parts.flatMap((p) => p.data?.losses ?? []),
  });
}

/* ------------------------------- public -------------------------------- */

export const PORTFOLIO_SCOPE_ID = "portfolio";

/**
 * Combine per-domain bundles into a single portfolio-wide bundle. The result is
 * structurally identical to a domain bundle, so every module page can render it
 * unchanged.
 */
export function aggregateBundles(bundles: DomainLiveBundle[]): DomainLiveBundle {
  const withData = bundles.filter((b) => Object.keys(b.datasets).length > 0);

  const lastSync = withData.reduce<string | null>(
    (acc, b) => (b.lastSync && (!acc || b.lastSync > acc) ? b.lastSync : acc),
    null,
  );

  const out: DomainLiveBundle = {
    domainId: PORTFOLIO_SCOPE_ID,
    lastSync,
    datasets: {},
  };
  if (withData.length === 0) return out;

  const d = out.datasets;
  d.keywords = concatDs<Keyword>(withData, "keywords");
  d.rank_snapshots = concatDs<RankSnapshot>(withData, "rank_snapshots");
  d.competitors = concatDs<Competitor>(withData, "competitors");
  d.keyword_gaps = concatDs<KeywordGapRow>(withData, "keyword_gaps");
  d.backlinks = concatDs<Backlink>(withData, "backlinks");
  d.referring_domains = concatDs<ReferringDomain>(withData, "referring_domains");
  d.backlink_history = concatDs<BacklinkHistoryPoint>(withData, "backlink_history");
  d.ai_prompts = concatDs<AiPrompt>(withData, "ai_prompts");
  d.gsc_queries = concatDs<GscRow>(withData, "gsc_queries");
  d.gsc_pages = concatDs<GscRow>(withData, "gsc_pages");
  d.striking_distance = concatDs<StrikingDistanceRow>(withData, "striking_distance");
  d.ga4_landing_pages = concatDs<Ga4LandingPage>(withData, "ga4_landing_pages");
  d.ga4_channels = concatDs<Ga4ChannelRow>(withData, "ga4_channels");
  d.recommendations = concatDs<DerivedRecommendation>(withData, "recommendations");

  d.gsc_totals = mergeGscTotals(withData);
  d.ga4_overview = mergeGa4Overview(withData);
  d.position_buckets = mergePositionBuckets(withData);
  d.gsc_timeseries = mergeTimeseries(withData);
  d.visibility_series = mergeVisibility(withData);
  d.onpage = mergeOnPage(withData);
  d.share_of_market = mergeShareOfMarket(withData);
  d.gsc_movers = mergeMovers(withData, "gsc_movers");
  d.gsc_page_movers = mergeMovers(withData, "gsc_page_movers");

  // Drop keys that merged to nothing so the UI's "awaiting sync" states work.
  for (const key of Object.keys(d) as Array<keyof typeof d>) {
    if (d[key] === undefined) delete d[key];
  }
  return out;
}
