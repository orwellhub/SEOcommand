import { getDataForSeoClient } from "@/providers/dataforseo";
import { createHash } from "node:crypto";
import { parseRobotsDirectives, snippetIssues } from "./discovery-files";
import { getGoogleAccessToken, googleConfigured } from "@/providers/google/auth";
import { GA4_API, GA4_SCOPE, GSC_SCOPE } from "@/providers/google/config";
import { assertPublicHostname, fetchPublic } from "./public-network";
import { siteUrl, type BusinessResult, type IndexResult, type PageEvidence, type SpeedResult } from "@/lib/command-model";
import type { ManagedSite } from "./types";

export function normalizeSpeed(body: any, url: string, device: "mobile" | "desktop"): SpeedResult {
  const result = body?.lighthouseResult;
  if (!result || result.runtimeError) throw new Error(result?.runtimeError?.message ?? "The speed provider returned no completed test. Retry later.");
  const metric = (id: string): number | null => typeof result.audits?.[id]?.numericValue === "number" ? result.audits[id].numericValue : null;
  const field = body.loadingExperience?.metrics && Object.keys(body.loadingExperience.metrics).length ? body.loadingExperience : body.originLoadingExperience;
  const fieldMetrics = Object.fromEntries(Object.entries(field?.metrics ?? {}).filter(([, value]) => typeof (value as any)?.percentile === "number").map(([key, value]) => [key, { percentile: (value as any).percentile as number, category: String((value as any).category ?? "Unknown") }]));
  return { url, finalUrl: result.finalDisplayedUrl ?? result.finalUrl ?? url, device, testedAt: result.fetchTime ?? new Date().toISOString(), score: typeof result.categories?.performance?.score === "number" ? Math.round(result.categories.performance.score * 100) : null, lcpMs: metric("largest-contentful-paint"), fcpMs: metric("first-contentful-paint"), tbtMs: metric("total-blocking-time"), cls: metric("cumulative-layout-shift"), speedIndexMs: metric("speed-index"), lighthouseVersion: result.lighthouseVersion ?? "Unknown", warnings: Array.isArray(result.runWarnings) ? result.runWarnings.map(String) : [], opportunities: Object.entries(result.audits ?? {}).filter(([, value]) => { const audit = value as any; return typeof audit.score === "number" && audit.score < 0.9 && !["notApplicable", "manual"].includes(audit.scoreDisplayMode); }).map(([id, value]) => { const audit = value as any; return { id, title: String(audit.title), display: String(audit.displayValue ?? "Review this finding"), savingsMs: typeof audit.details?.overallSavingsMs === "number" ? audit.details.overallSavingsMs : null }; }).sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0)).slice(0, 15), field: Object.keys(fieldMetrics).length ? { scope: field === body.loadingExperience ? "page" : "origin", id: String(field.id ?? url), metrics: fieldMetrics } : null };
}
export async function collectSpeed(site: ManagedSite, input: string, device: "mobile" | "desktop", provider: "google" | "dataforseo" = "google") {
  const url = siteUrl(input, site.host);
  if (!url) throw new Error("Choose a URL on this website.");
  await assertPublicHostname(new URL(url).hostname);
  if (provider === "dataforseo") {
    const response = await getDataForSeoClient().post<Record<string, unknown>>("onPageLighthouse", "/v3/on_page/lighthouse/live/json", [{ url, for_mobile: device === "mobile", categories: ["performance"] }], { domainSlug: site.id, retry: false });
    const result = normalizeSpeed({ lighthouseResult: response.result[0] }, url, device);
    return { ...result, provider: "dataforseo", costUsd: response.costUsd, warnings: [...result.warnings, "DataForSEO Lighthouse lab test. Field / real-user metrics are not supplied by this endpoint."] };
  }
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url); endpoint.searchParams.set("strategy", device); endpoint.searchParams.set("category", "performance");
  const headers: Record<string, string> = {};
  if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);
  else if (googleConfigured()) {
    // PageSpeed supports the openid OAuth scope; reuse the configured account
    // instead of relying on Google's shared anonymous quota.
    try { headers.Authorization = `Bearer ${await getGoogleAccessToken(["openid"])}`; }
    catch { throw new Error("The Google connection could not authorize speed tests. Configure a PageSpeed API key or review the connected Google account."); }
    if (process.env.GOOGLE_CLOUD_PROJECT) headers["x-goog-user-project"] = process.env.GOOGLE_CLOUD_PROJECT;
  }
  const response = await fetch(endpoint, { headers, cache: "no-store", signal: AbortSignal.timeout(180000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? "Google’s speed-test quota is temporarily exhausted. Retry later or configure a PageSpeed API key in the service settings." : `Speed test failed (${response.status}). ${String(body?.error?.message ?? "Retry later.").slice(0, 300)}`);
  return normalizeSpeed(body, url, device);
}
export async function inspectIndex(site: ManagedSite, input: string): Promise<IndexResult> {
  const url = siteUrl(input, site.host);
  if (!url) throw new Error("Choose a URL on this website.");
  if (!site.gscSite) throw new Error("Connect this website’s Search Console property first.");
  const token = await getGoogleAccessToken([GSC_SCOPE]);
  const response = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ inspectionUrl: url, siteUrl: site.gscSite, languageCode: "en-US" }), signal: AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Search Console inspection failed (${response.status}). ${String(body?.error?.message ?? "Check property access.").slice(0, 300)}`);
  const result = body.inspectionResult?.indexStatusResult;
  if (!result) throw new Error("Google returned no reported index status for this URL.");
  return { url, inspectedAt: new Date().toISOString(), verdict: result.verdict ?? "VERDICT_UNSPECIFIED", coverage: result.coverageState ?? "Unknown", lastCrawl: result.lastCrawlTime ?? null, robots: result.robotsTxtState ?? "Unknown", indexing: result.indexingState ?? "Unknown", googleCanonical: result.googleCanonical ?? null, userCanonical: result.userCanonical ?? null, inspectionLink: body.inspectionResult?.inspectionResultLink ?? null };
}

export async function collectBusiness(site: ManagedSite, mapping: Record<string, string>): Promise<BusinessResult> {
  if (!site.ga4PropertyId) throw new Error("Connect this website’s Google Analytics property first.");
  if (!Object.keys(mapping).length) throw new Error("Choose the Analytics events that represent enquiries, bookings or qualified leads.");
  const token = await getGoogleAccessToken([GA4_SCOPE]);
  const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(end) - 89 * 86400000).toISOString().slice(0, 10);
  const response = await fetch(`${GA4_API}/properties/${site.ga4PropertyId}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: "date" }, { name: "pageLocation" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: { andGroup: { expressions: [{ filter: { fieldName: "eventName", inListFilter: { values: Object.keys(mapping) } } }, { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } }] } }, limit: 10000, orderBys: [{ dimension: { dimensionName: "date" }, desc: true }] }), signal: AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Business events could not be collected from Google Analytics (${response.status}). ${String(body?.error?.message ?? "Check property access.").slice(0, 300)}`);
  const rows = (body.rows ?? []).map((row: any) => { const date = String(row.dimensionValues?.[0]?.value ?? ""); const event = String(row.dimensionValues?.[2]?.value ?? ""); return { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, url: String(row.dimensionValues?.[1]?.value ?? ""), event, category: mapping[event] ?? "unmapped", count: Number(row.metricValues?.[0]?.value ?? 0) }; }).filter((row: any) => siteUrl(row.url, site.host));
  return { collectedAt: new Date().toISOString(), start, end, rows, mapping, rowCount: body.rowCount ?? rows.length, truncated: (body.rowCount ?? 0) > 10000, thresholded: Boolean(body.metadata?.subjectToThresholding) };
}

function attribute(tag: string, name: string) { return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null; }
async function boundedText(response: Response) {
  const reader = response.body?.getReader(); if (!reader) return "";
  const decoder = new TextDecoder(); let length = 0, text = "";
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 2_000_000) throw new Error("Page exceeds the 2 MB watch-check limit."); text += decoder.decode(part.value, { stream: true }); } return text + decoder.decode(); }
  finally { await reader.cancel().catch(() => undefined); }
}
export async function checkWatchedPage(site: ManagedSite, input: string): Promise<PageEvidence> {
  const url = siteUrl(input, site.host); if (!url) throw new Error("Choose a URL on this website.");
  const response = await fetchPublic(url, { headers: { "User-Agent": "SEOCommandPageWatch/1.0" }, signal: AbortSignal.timeout(30000), cache: "no-store" });
  const html = await boundedText(response);
  const tags = html.match(/<(?:meta|link)\b[^>]*>/gi) ?? [];
  const robotsValues = tags.filter((tag) => /^(robots|googlebot)$/i.test(attribute(tag, "name") ?? "")).map((tag) => attribute(tag, "content") ?? "");
  const robots = robotsValues.join(" ");
  const canonicalTag = tags.find((tag) => /canonical/i.test(attribute(tag, "rel") ?? ""));
  // Each value is parsed separately: meta values are comma-delimited, so the
  // joined string above cannot be split reliably.
  const directives = parseRobotsDirectives(...robotsValues, response.headers.get("x-robots-tag"));
  const issues = snippetIssues(directives, (html.match(/[\s"']data-nosnippet[\s=>"']/gi) ?? []).length);
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { url, finalUrl: response.url || url, title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null, statusCode: response.status, canonical: canonicalTag ? attribute(canonicalTag, "href") : null, indexable: response.ok && !/noindex|\bnone\b/i.test(`${robots} ${response.headers.get("x-robots-tag") ?? ""}`), hash: createHash("sha256").update(text).digest("hex"), tracking: [...new Set(html.match(/\b(?:G-[A-Z0-9]{5,20}|GTM-[A-Z0-9]{4,15}|UA-\d+-\d+)\b/g) ?? [])], capturedAt: new Date().toISOString(), issues };
}
