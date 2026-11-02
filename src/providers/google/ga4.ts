import type { DomainId, Ga4ChannelRow, Ga4LandingPage, Ga4Overview, Ga4SourceRow, Ga4Sources } from "@/lib/types";
import { getGoogleAccessToken } from "./auth";
import { GA4_API, GA4_SCOPE, GA4_DATA_LAG_DAYS } from "./config";
import { getManagedSite } from "@/platform/site-store";

/**
 * GA4 Data API access, ported from the reference pull script (pull_ga4.py).
 * Direct REST against analyticsdata.googleapis.com runReport. Read-only,
 * server-side only. Organic views filter to the "Organic Search" channel.
 */

export class Ga4ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "Ga4ApiError";
  }
}

export class Ga4PropertyNotConfiguredError extends Error {
  constructor(domainId: DomainId) {
    super(`No GA4 property id configured for "${domainId}". Set GA4_PROPERTY_${domainId.toUpperCase()}.`);
    this.name = "Ga4PropertyNotConfiguredError";
  }
}

/** The portfolio's lead event (every site fires generate_lead on a confirmed enquiry). */
export const GA4_LEAD_EVENT = "generate_lead";

const ORGANIC_FILTER = {
  filter: {
    fieldName: "sessionDefaultChannelGroup",
    stringFilter: { value: "Organic Search" },
  },
};

async function runReport(propertyId: string, body: Record<string, unknown>): Promise<any> {
  const token = await getGoogleAccessToken([GA4_SCOPE]);
  const url = `${GA4_API}/properties/${propertyId}:runReport`;
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
    throw new Ga4ApiError(`GA4 Data API ${res.status}: ${detail}`, res.status);
  }
  return res.json();
}

async function propertyFor(domainId: DomainId): Promise<string> {
  const id = (await getManagedSite(domainId))?.ga4PropertyId;
  if (!id) throw new Ga4PropertyNotConfiguredError(domainId);
  return id;
}

function dateRange(days: number) {
  const endDate = new Date(Date.now() - GA4_DATA_LAG_DAYS * 86_400_000).toISOString().slice(0, 10);
  const startDate = new Date(Date.parse(endDate) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function ga4OrganicOverview(domainId: DomainId, days = 28): Promise<Ga4Overview> {
  const property = await propertyFor(domainId);
  const metrics = [
    "sessions",
    "totalUsers",
    "newUsers",
    "engagedSessions",
    "engagementRate",
    "keyEvents",
    "screenPageViews",
    "averageSessionDuration",
  ];
  const payload = await runReport(property, {
    dateRanges: [dateRange(days)],
    metrics: metrics.map((name) => ({ name })),
    dimensionFilter: ORGANIC_FILTER,
  });
  const mv: string[] = (payload?.rows?.[0]?.metricValues ?? []).map((m: any) => m.value);
  return {
    sessions: num(mv[0]),
    totalUsers: num(mv[1]),
    newUsers: num(mv[2]),
    engagedSessions: num(mv[3]),
    engagementRate: Math.round(num(mv[4]) * 1000) / 10,
    conversions: num(mv[5]),
    screenPageViews: num(mv[6]),
    averageSessionDuration: mv[7] == null ? null : num(mv[7]),
  };
}

export async function ga4LandingPages(domainId: DomainId, days = 28, limit = 25): Promise<Ga4LandingPage[]> {
  const property = await propertyFor(domainId);
  const payload = await runReport(property, {
    dateRanges: [dateRange(days)],
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: ["sessions", "totalUsers", "engagementRate", "keyEvents"].map((name) => ({ name })),
    dimensionFilter: ORGANIC_FILTER,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });
  return (payload?.rows ?? []).map((r: any) => {
    const mv = r.metricValues.map((m: any) => m.value);
    return {
      landingPage: r.dimensionValues?.[0]?.value ?? "",
      sessions: num(mv[0]),
      totalUsers: num(mv[1]),
      engagementRate: Math.round(num(mv[2]) * 1000) / 10,
      conversions: num(mv[3]),
    };
  });
}

export async function ga4Channels(domainId: DomainId, days = 28): Promise<Ga4ChannelRow[]> {
  const property = await propertyFor(domainId);
  const payload = await runReport(property, {
    dateRanges: [dateRange(days)],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: ["sessions", "keyEvents"].map((name) => ({ name })),
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 20,
  });
  return (payload?.rows ?? []).map((r: any) => {
    const mv = r.metricValues.map((m: any) => m.value);
    return {
      channel: r.dimensionValues?.[0]?.value ?? "",
      sessions: num(mv[0]),
      conversions: num(mv[1]),
    };
  });
}

/** Dashboard history plus complete, fixed 28-day geography and page breakdowns. */
export async function ga4Dashboard(domainId: DomainId): Promise<import("@/lib/dashboard-data").Ga4Dashboard> {
  const { shiftDate } = await import("@/lib/dashboard-data");
  const property = await propertyFor(domainId);
  const endDate = shiftDate(new Date().toISOString().slice(0, 10), -GA4_DATA_LAG_DAYS);
  const startDate = shiftDate(endDate, -179);
  const breakdownStartDate = shiftDate(endDate, -27);
  const base = { dimensionFilter: ORGANIC_FILTER, keepEmptyRows: true };
  const seriesReport = await runReport(property, {
    ...base, dateRanges: [{ startDate, endDate }], dimensions: [{ name: "date" }],
    metrics: ["sessions", "engagedSessions", "screenPageViews", "keyEvents"].map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: "date" } }], limit: 180,
  });
  const countryReport = await runReport(property, {
    ...base, dateRanges: [{ startDate: breakdownStartDate, endDate }], dimensions: [{ name: "countryId" }, { name: "country" }],
    metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 300,
  });
  const pageReport = await runReport(property, {
    ...base, dateRanges: [{ startDate: breakdownStartDate, endDate }], dimensions: [{ name: "pageTitle" }, { name: "hostName" }, { name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 100,
  });
  return {
    startDate, endDate, breakdownStartDate, domainIds: [domainId],
    qualityNote: seriesReport?.metadata?.subjectToThresholding || seriesReport?.metadata?.samplingMetadatas?.length ? "Google applied reporting limits or sampling; these figures may be incomplete." : undefined,
    completeDateRange: Number(seriesReport?.rowCount ?? seriesReport?.rows?.length ?? 0) <= 180 && !seriesReport?.metadata?.subjectToThresholding && !(seriesReport?.metadata?.samplingMetadatas?.length),
    series: (seriesReport?.rows ?? []).map((r: any) => {
      const date = r.dimensionValues?.[0]?.value ?? "";
      const mv = r.metricValues ?? [];
      return { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, sessions: num(mv[0]?.value), engagedSessions: num(mv[1]?.value), views: num(mv[2]?.value), conversions: num(mv[3]?.value) };
    }),
    countries: (countryReport?.rows ?? []).map((r: any) => ({ code: r.dimensionValues?.[0]?.value ?? "", country: r.dimensionValues?.[1]?.value ?? "Unknown", sessions: num(r.metricValues?.[0]?.value) })),
    pages: (pageReport?.rows ?? []).map((r: any) => ({ domainId, title: r.dimensionValues?.[0]?.value || "Untitled page", host: r.dimensionValues?.[1]?.value ?? "", path: r.dimensionValues?.[2]?.value ?? "/", views: num(r.metricValues?.[0]?.value) })),
  };
}

/**
 * Sessions by source/medium for two adjacent windows (2 Nov 2026). This is what separates traffic
 * from AI assistants (chatgpt.com, perplexity.ai ...) and from search engines other than Google,
 * which Search Console cannot see. No channel filter. The second report counts generate_lead
 * events by the same dimensions; a site that names its lead event differently shows 0 leads and
 * the payload says which event was counted.
 */
export async function ga4Sources(domainId: DomainId, days = 28): Promise<Ga4Sources> {
  const property = await propertyFor(domainId);
  const current = dateRange(days);
  const prevEnd = new Date(Date.parse(current.startDate) - 86_400_000).toISOString().slice(0, 10);
  const previous = { startDate: new Date(Date.parse(prevEnd) - (days - 1) * 86_400_000).toISOString().slice(0, 10), endDate: prevEnd };
  const dimensions = ["sessionSource", "sessionMedium", "sessionDefaultChannelGroup"].map((name) => ({ name }));
  const base = { dateRanges: [{ ...current, name: "current" }, { ...previous, name: "previous" }], dimensions, limit: 250 };
  const [traffic, leads] = await Promise.all([
    runReport(property, { ...base, metrics: ["sessions", "engagedSessions", "keyEvents"].map((name) => ({ name })), orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    runReport(property, { ...base, metrics: [{ name: "eventCount" }], dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: GA4_LEAD_EVENT } } } }).catch(() => null),
  ]);
  const key = (r: any) => (r.dimensionValues ?? []).slice(0, 3).map((d: any) => d?.value ?? "").join("\u0001");
  const rangeOf = (r: any) => String(r.dimensionValues?.[3]?.value ?? "current");
  const leadCount = new Map<string, number>();
  for (const r of leads?.rows ?? []) leadCount.set(`${rangeOf(r)}\u0002${key(r)}`, num(r.metricValues?.[0]?.value));
  const rows: Record<"current" | "previous", Ga4SourceRow[]> = { current: [], previous: [] };
  for (const r of traffic?.rows ?? []) {
    const range = rangeOf(r) === "previous" ? "previous" : "current";
    const mv = r.metricValues ?? [];
    rows[range].push({
      source: r.dimensionValues?.[0]?.value ?? "",
      medium: r.dimensionValues?.[1]?.value ?? "",
      channel: r.dimensionValues?.[2]?.value ?? "",
      sessions: num(mv[0]?.value),
      engagedSessions: num(mv[1]?.value),
      keyEvents: num(mv[2]?.value),
      leads: leadCount.get(`${range}\u0002${key(r)}`) ?? 0,
    });
  }
  return {
    days,
    current: { start: current.startDate, end: current.endDate, rows: rows.current },
    previous: { start: previous.startDate, end: previous.endDate, rows: rows.previous },
    leadEvent: GA4_LEAD_EVENT,
    leadsCounted: leads !== null,
    truncated: Number(traffic?.rowCount ?? 0) > 250,
  };
}
