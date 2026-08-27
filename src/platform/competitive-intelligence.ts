import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getManagedSite } from "./site-store";
import { getDataForSeoClient } from "@/providers/dataforseo";
import { ENDPOINTS, locationForSite } from "@/providers/dataforseo/config";

type Row = Record<string, unknown>;

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function items(result: Row[]): Row[] {
  return result.flatMap((entry) => rows(entry.items));
}

export function cleanCompetitorHost(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!candidate.includes(".") || !/^[a-z0-9.-]+$/.test(candidate)) throw new Error("Enter a valid competitor domain.");
  return candidate;
}

export interface CompetitorExplorerResult {
  targetHost: string;
  capturedAt: string;
  overview: {
    organicKeywords: number | null;
    organicTraffic: number | null;
    paidKeywords: number | null;
    paidTraffic: number | null;
    estimatedTrafficCost: number | null;
  };
  keywords: Array<{ keyword: string; position: number | null; volume: number | null; difficulty: number | null; intent: string | null; url: string | null; traffic: number | null }>;
  pages: Array<{ url: string; keywords: number | null; traffic: number | null; trafficCost: number | null }>;
  backlinks: { rank: number | null; backlinks: number | null; referringDomains: number | null; spamScore: number | null };
}

export interface CollectedDomainResearch extends CompetitorExplorerResult {
  costUsd: number;
}

/** Collect domain evidence without attaching it to a managed website. The
 * global SpendGuard still preflights every call and records actual cost. */
export async function collectDomainResearch(opts: {
  targetHost: string;
  locationCode: number;
  languageCode: string;
  domainSlug?: string | null;
}): Promise<CollectedDomainResearch> {
  const targetHost = cleanCompetitorHost(opts.targetHost);
  const client = getDataForSeoClient();
  const base = { target: targetHost, location_code: opts.locationCode, language_code: opts.languageCode };
  const providerOptions = { domainSlug: opts.domainSlug ?? null };
  // Run sequentially so each actual cost is recorded before the next
  // preflight. Parallel calls could all observe the same near-limit balance.
  const overviewResponse = await client.post<Row>("labsDomainRankOverview", ENDPOINTS.labsDomainRankOverview, [{ ...base }], providerOptions);
  const keywordResponse = await client.post<Row>("labsRankedKeywords", ENDPOINTS.labsRankedKeywords, [{ ...base, limit: 250, order_by: ["keyword_data.keyword_info.search_volume,desc"] }], providerOptions);
  const pageResponse = await client.post<Row>("labsRelevantPages", ENDPOINTS.labsRelevantPages, [{ ...base, limit: 100, order_by: ["metrics.organic.etv,desc"] }], providerOptions);
  const backlinkResponse = await client.post<Row>("backlinksSummary", ENDPOINTS.backlinksSummary, [{ target: targetHost, include_subdomains: true }], providerOptions);
  const overviewRaw = items(overviewResponse.result)[0] ?? overviewResponse.result[0] ?? {};
  const metrics = record(overviewRaw.metrics);
  const organic = record(metrics.organic);
  const paid = record(metrics.paid);
  const keywords = items(keywordResponse.result).map((item) => {
    const keywordData = record(item.keyword_data);
    const keywordInfo = record(keywordData.keyword_info);
    const properties = record(keywordData.keyword_properties);
    const intentInfo = record(keywordData.search_intent_info);
    const serpItem = record(record(item.ranked_serp_element).serp_item);
    return { keyword: string(keywordData.keyword) ?? "", position: number(serpItem.rank_absolute), volume: number(keywordInfo.search_volume), difficulty: number(properties.keyword_difficulty), intent: string(intentInfo.main_intent), url: string(serpItem.url), traffic: number(serpItem.etv) };
  }).filter((item) => item.keyword);
  const pages = items(pageResponse.result).map((item) => {
    const pageOrganic = record(record(item.metrics).organic);
    return { url: string(item.page_address) ?? string(item.url) ?? "", keywords: number(pageOrganic.count), traffic: number(pageOrganic.etv), trafficCost: number(pageOrganic.estimated_paid_traffic_cost) };
  }).filter((item) => item.url);
  const backlinkRaw = backlinkResponse.result[0] ?? {};
  return {
    targetHost,
    capturedAt: new Date().toISOString(),
    costUsd: overviewResponse.costUsd + keywordResponse.costUsd + pageResponse.costUsd + backlinkResponse.costUsd,
    overview: { organicKeywords: number(organic.count), organicTraffic: number(organic.etv), paidKeywords: number(paid.count), paidTraffic: number(paid.etv), estimatedTrafficCost: number(organic.estimated_paid_traffic_cost) },
    keywords,
    pages,
    backlinks: { rank: number(backlinkRaw.rank), backlinks: number(backlinkRaw.backlinks), referringDomains: number(backlinkRaw.referring_domains), spamScore: number(backlinkRaw.backlinks_spam_score) },
  };
}

export async function exploreCompetitor(siteSlug: string, targetInput: string): Promise<CompetitorExplorerResult> {
  const site = await getManagedSite(siteSlug);
  if (!site) throw new Error("Website not found.");
  const location = locationForSite(site);
  const collected = await collectDomainResearch({ targetHost: targetInput, locationCode: location.location_code, languageCode: location.language_code, domainSlug: siteSlug });
  const { costUsd: _costUsd, ...result } = collected;
  await db().insert(schema.competitorResearchRuns).values({
    siteSlug,
    targetHost: result.targetHost,
    overview: result.overview,
    keywords: result.keywords,
    pages: result.pages,
    backlinks: result.backlinks,
  });
  return result;
}

export async function recentCompetitorExplorations(siteSlug: string) {
  return db().select().from(schema.competitorResearchRuns)
    .where(eq(schema.competitorResearchRuns.siteSlug, siteSlug))
    .orderBy(desc(schema.competitorResearchRuns.capturedAt)).limit(25);
}

export interface LinkGapProspect {
  sourceDomain: string;
  authority: number | null;
  relevance: number;
  reason: string;
  competitorHosts: string[];
}

export function buildLinkGapRequest(siteHost: string, competitorHosts: string[]) {
  return {
    targets: Object.fromEntries(competitorHosts.map((host, index) => [String(index + 1), host])),
    exclude_targets: [siteHost],
    limit: 500,
    // Domain Intersection metrics are nested under the numbered target. There is
    // no top-level `rank` field to sort by.
    order_by: ["1.rank,desc"],
    rank_scale: "one_hundred",
  };
}

export function parseLinkGapProspects(
  result: Row[],
  competitorHosts: string[],
  siteHost: string,
): LinkGapProspect[] {
  return items(result).map((item): LinkGapProspect | null => {
    const intersections = Object.entries(record(item.domain_intersection)).flatMap(([targetIndex, value]) => {
      const evidence = record(value);
      const sourceDomain = string(evidence.target);
      if (!sourceDomain) return [];
      const competitorHost = competitorHosts[Number(targetIndex) - 1];
      return [{ sourceDomain, competitorHost, authority: number(evidence.rank) }];
    });
    const first = intersections[0];
    if (!first) return null;
    const matchedCompetitors = [...new Set(intersections.map((entry) => entry.competitorHost).filter((host): host is string => Boolean(host)))];
    const authorities = intersections.map((entry) => entry.authority).filter((value): value is number => value !== null);
    const authority = authorities.length ? Math.max(...authorities) : null;
    const linked = matchedCompetitors.length || intersections.length;
    return {
      sourceDomain: first.sourceDomain,
      authority,
      relevance: Math.min(100, Math.round((linked / competitorHosts.length) * 60 + Math.min(authority ?? 0, 100) * 0.4)),
      reason: `Links to ${linked} selected competitor${linked === 1 ? "" : "s"}, but not ${siteHost}.`,
      competitorHosts: matchedCompetitors,
    };
  }).filter((item): item is LinkGapProspect => Boolean(item));
}

export async function discoverLinkGapProspects(siteSlug: string, competitorInputs: string[]): Promise<LinkGapProspect[]> {
  const site = await getManagedSite(siteSlug);
  if (!site) throw new Error("Website not found.");
  const competitorHosts = [...new Set(competitorInputs.map(cleanCompetitorHost))].filter((host) => host !== site.host).slice(0, 10);
  if (!competitorHosts.length) throw new Error("Add at least one competitor domain.");
  const { result } = await getDataForSeoClient().post<Row>(
    "backlinksDomainIntersection",
    ENDPOINTS.backlinksDomainIntersection,
    [buildLinkGapRequest(site.host, competitorHosts)],
    { domainSlug: siteSlug },
  );
  const prospects = parseLinkGapProspects(result, competitorHosts, site.host);
  for (let index = 0; index < prospects.length; index += 200) {
    await db().insert(schema.linkProspects).values(prospects.slice(index, index + 200).map((prospect) => ({ siteSlug, ...prospect })))
      .onConflictDoUpdate({
        target: [schema.linkProspects.siteSlug, schema.linkProspects.sourceDomain],
        set: { authority: sql`excluded.authority`, relevance: sql`excluded.relevance`, reason: sql`excluded.reason`, competitorHosts: sql`excluded.competitor_hosts`, updatedAt: sql`now()` },
      });
  }
  return prospects;
}
