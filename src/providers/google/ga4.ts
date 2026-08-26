import type { DomainId, Ga4ChannelRow, Ga4LandingPage, Ga4Overview } from "@/lib/types";
import { getGoogleAccessToken } from "./auth";
import { GA4_API, GA4_SCOPE } from "./config";
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
  return { startDate: `${days}daysAgo`, endDate: "today" };
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
