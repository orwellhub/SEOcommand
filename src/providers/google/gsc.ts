import type {
  DomainId,
  GscMover,
  GscRow,
  GscQueryPageRow,
  GscTotals,
  ShareOfMarket,
  StrikingDistanceRow,
} from "@/lib/types";
import { getGoogleAccessToken } from "./auth";
import { GSC_API, GSC_DATA_LAG_DAYS, GSC_SCOPE } from "./config";
import { getManagedSite } from "@/platform/site-store";
import benchmarksRaw from "@/data/benchmarks.json";

/**
 * Google Search Console access, ported from the reference MCP (gsc_mcp.py).
 * Direct REST against the Search Console API, service-account/refresh-token
 * authenticated. Read-only. Server-side only.
 */

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Trailing window ending at (today − 2 day finalisation lag). */
function defaultRange(days: number): { start: string; end: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - GSC_DATA_LAG_DAYS);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: isoDay(start), end: isoDay(end) };
}

export class GscApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GscApiError";
  }
}

async function gscQuery(siteUrl: string, body: unknown): Promise<any> {
  const token = await getGoogleAccessToken([GSC_SCOPE]);
  const url = `${GSC_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message ?? "";
    } catch {
      detail = (await res.text()).slice(0, 300);
    }
    throw new GscApiError(`Search Console API ${res.status}: ${detail}`, res.status);
  }
  return res.json();
}

function toRows(payload: any): GscRow[] {
  return (payload?.rows ?? []).map((r: any) => ({
    key: (r.keys ?? []).join(" | "),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: Math.round((r.ctr ?? 0) * 1000) / 10,
    position: Math.round((r.position ?? 0) * 10) / 10,
  }));
}

async function siteFor(domainId: DomainId): Promise<string> {
  const site = await getManagedSite(domainId);
  if (!site?.gscSite) throw new Error(`No Search Console property configured for "${domainId}".`);
  return site.gscSite;
}

export async function gscTotals(domainId: DomainId, days = 28): Promise<GscTotals> {
  const { start, end } = defaultRange(days);
  const payload = await gscQuery(await siteFor(domainId), {
    startDate: start,
    endDate: end,
    dimensions: [],
    type: "web",
    dataState: "final",
  });
  const r = payload?.rows?.[0] ?? {};
  return {
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: Math.round((r.ctr ?? 0) * 1000) / 10,
    position: Math.round((r.position ?? 0) * 10) / 10,
  };
}

export async function gscBreakdown(
  domainId: DomainId,
  dimension: "query" | "page" | "country" | "device",
  days = 28,
  rowLimit = 100,
): Promise<GscRow[]> {
  const { start, end } = defaultRange(days);
  const payload = await gscQuery(await siteFor(domainId), {
    startDate: start,
    endDate: end,
    dimensions: [dimension],
    rowLimit: Math.min(rowLimit, 25000),
    type: "web",
    dataState: "final",
  });
  return toRows(payload);
}

/** Query→page evidence used for cannibalisation and page-intent mapping. */
export async function gscQueryPages(
  domainId: DomainId,
  days = 28,
  rowLimit = 25_000,
): Promise<GscQueryPageRow[]> {
  const { start, end } = defaultRange(days);
  const payload = await gscQuery(await siteFor(domainId), {
    startDate: start,
    endDate: end,
    dimensions: ["query", "page"],
    rowLimit: Math.min(rowLimit, 25_000),
    type: "web",
    dataState: "final",
  });
  return (payload?.rows ?? []).map((row: any) => ({
    key: `${row.keys?.[0] ?? ""} | ${row.keys?.[1] ?? ""}`,
    query: row.keys?.[0] ?? "",
    page: row.keys?.[1] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: Math.round((row.ctr ?? 0) * 1000) / 10,
    position: Math.round((row.position ?? 0) * 10) / 10,
  }));
}

/** Daily clicks/impressions/CTR/position over a trailing window — real trend data. */
export async function gscTimeseries(
  domainId: DomainId,
  days = 90,
): Promise<{ date: string; clicks: number; impressions: number; ctr: number; position: number }[]> {
  const { start, end } = defaultRange(days);
  const payload = await gscQuery(await siteFor(domainId), {
    startDate: start,
    endDate: end,
    dimensions: ["date"],
    rowLimit: 1000,
    type: "web",
    dataState: "final",
  });
  return (payload?.rows ?? [])
    .map((r: any) => ({
      date: (r.keys ?? [])[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: Math.round((r.ctr ?? 0) * 1000) / 10,
      position: Math.round((r.position ?? 0) * 10) / 10,
    }))
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
}

export async function gscStrikingDistance(
  domainId: DomainId,
  days = 28,
  minPosition = 4,
  maxPosition = 20,
  minImpressions = 20,
  rowLimit = 50,
): Promise<StrikingDistanceRow[]> {
  const rows = await gscBreakdown(domainId, "query", days, 25000);
  return rows
    .filter((r) => r.position >= minPosition && r.position <= maxPosition && r.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, rowLimit)
    .map((r) => ({
      query: r.key,
      position: r.position,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
    }));
}

export async function gscMovers(
  domainId: DomainId,
  days = 28,
  rowLimit = 25,
  dimension: "query" | "page" = "query",
): Promise<{ gains: GscMover[]; losses: GscMover[] }> {
  const site = await siteFor(domainId);
  const curEnd = new Date();
  curEnd.setUTCDate(curEnd.getUTCDate() - GSC_DATA_LAG_DAYS);
  const curStart = new Date(curEnd);
  curStart.setUTCDate(curStart.getUTCDate() - (days - 1));
  const prevEnd = new Date(curStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));

  async function pull(s: Date, e: Date) {
    const payload = await gscQuery(site, {
      startDate: isoDay(s),
      endDate: isoDay(e),
      dimensions: [dimension],
      rowLimit: 25000,
      type: "web",
      dataState: "final",
    });
    const map = new Map<string, { clicks: number; position: number }>();
    for (const r of payload?.rows ?? []) {
      map.set((r.keys ?? [])[0] ?? "", { clicks: r.clicks ?? 0, position: r.position ?? 0 });
    }
    return map;
  }

  const cur = await pull(curStart, curEnd);
  const prev = await pull(prevStart, prevEnd);
  const keys = new Set([...cur.keys(), ...prev.keys()]);
  const moves: GscMover[] = [];
  for (const k of keys) {
    const c = cur.get(k)?.clicks ?? 0;
    const p = prev.get(k)?.clicks ?? 0;
    if (c === 0 && p === 0) continue;
    moves.push({
      key: k,
      clicksNow: c,
      clicksBefore: p,
      change: c - p,
      positionNow: cur.get(k)?.position ?? null,
      positionBefore: prev.get(k)?.position ?? null,
    });
  }
  moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return {
    gains: moves.filter((m) => m.change > 0).slice(0, rowLimit),
    losses: moves.filter((m) => m.change < 0).slice(0, rowLimit),
  };
}

interface BenchmarkEntry {
  site: string;
  keyword_count: number;
  monthly_search_volume: number;
  available_monthly_clicks: number;
  baselined?: string;
}

function findBenchmark(site: string): BenchmarkEntry | null {
  const data = benchmarksRaw as unknown as BenchmarkEntry | BenchmarkEntry[];
  if (Array.isArray(data)) return data.find((e) => e.site === site) ?? null;
  return data.site === site ? data : null;
}

export async function shareOfMarket(domainId: DomainId, days = 28): Promise<ShareOfMarket | null> {
  const site = await siteFor(domainId);
  const bench = findBenchmark(site);
  if (!bench) return null;
  const totals = await gscTotals(domainId, days);
  const availableInWindow = bench.available_monthly_clicks * (days / 30);
  const demandInWindow = bench.monthly_search_volume * (days / 30);
  return {
    site,
    windowDays: days,
    measuredClicks: totals.clicks,
    measuredImpressions: totals.impressions,
    keywordCount: bench.keyword_count,
    monthlySearchVolume: bench.monthly_search_volume,
    availableMonthlyClicks: bench.available_monthly_clicks,
    availableClicksInWindow: Math.round(availableInWindow),
    shareOfAvailableClicksPct: availableInWindow ? Math.round((totals.clicks / availableInWindow) * 10000) / 100 : 0,
    impressionShareOfDemandPct: demandInWindow ? Math.round((totals.impressions / demandInWindow) * 10000) / 100 : 0,
    baselined: bench.baselined ?? null,
  };
}
