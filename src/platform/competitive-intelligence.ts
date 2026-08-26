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

export async function exploreCompetitor(siteSlug: string, targetInput: string): Promise<CompetitorExplorerResult> {
  const site = await getManagedSite(siteSlug);
  if (!site) throw new Error("Website not found.");
  const targetHost = cleanCompetitorHost(targetInput);
  const location = locationForSite(site);
  const client = getDataForSeoClient();
  const base = { target: targetHost, ...location };
  const [overviewResponse, keywordResponse, pageResponse, backlinkResponse] = await Promise.all([
    client.post<Row>("labsDomainRankOverview", ENDPOINTS.labsDomainRankOverview, [{ ...base }], { domainSlug: siteSlug }),
    client.post<Row>("labsRankedKeywords", ENDPOINTS.labsRankedKeywords, [{ ...base, limit: 250, order_by: ["keyword_data.keyword_info.search_volume,desc"] }], { domainSlug: siteSlug }),
    client.post<Row>("labsRelevantPages", ENDPOINTS.labsRelevantPages, [{ ...base, limit: 100, order_by: ["metrics.organic.etv,desc"] }], { domainSlug: siteSlug }),
    client.post<Row>("backlinksSummary", ENDPOINTS.backlinksSummary, [{ target: targetHost, include_subdomains: true }], { domainSlug: siteSlug }),
  ]);
  const overviewRaw = items(overviewResponse.result)[0] ?? overviewResponse.result[0] ?? {};
  const metrics = record(overviewRaw.metrics);
  const organic = record(metrics.organic);
  const paid = record(metrics.paid);
  const keywords = items(keywordResponse.result).map((item) => {
    const keywordData = record(item.keyword_data);
    const keywordInfo = record(keywordData.keyword_info);
    const properties = record(keywordData.keyword_properties);
    const intentInfo = record(keywordData.search_intent_info);
    const serpElement = record(item.ranked_serp_element);
    const serpItem = record(serpElement.serp_item);
    return {
      keyword: string(keywordData.keyword) ?? "",
      position: number(serpItem.rank_absolute),
      volume: number(keywordInfo.search_volume),
      difficulty: number(properties.keyword_difficulty),
      intent: string(intentInfo.main_intent),
      url: string(serpItem.url),
      traffic: number(serpItem.etv),
    };
  }).filter((item) => item.keyword);
  const pages = items(pageResponse.result).map((item) => {
    const pageMetrics = record(item.metrics);
    const pageOrganic = record(pageMetrics.organic);
    return {
      url: string(item.page_address) ?? string(item.url) ?? "",
      keywords: number(pageOrganic.count),
      traffic: number(pageOrganic.etv),
      trafficCost: number(pageOrganic.estimated_paid_traffic_cost),
    };
  }).filter((item) => item.url);
  const backlinkRaw = backlinkResponse.result[0] ?? {};
  const result: CompetitorExplorerResult = {
    targetHost,
    capturedAt: new Date().toISOString(),
    overview: {
      organicKeywords: number(organic.count),
      organicTraffic: number(organic.etv),
      paidKeywords: number(paid.count),
      paidTraffic: number(paid.etv),
      estimatedTrafficCost: number(organic.estimated_paid_traffic_cost),
    },
    keywords,
    pages,
    backlinks: {
      rank: number(backlinkRaw.rank),
      backlinks: number(backlinkRaw.backlinks),
      referringDomains: number(backlinkRaw.referring_domains),
      spamScore: number(backlinkRaw.backlinks_spam_score),
    },
  };
  await db().insert(schema.competitorResearchRuns).values({
    siteSlug,
    targetHost,
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

export async function discoverLinkGapProspects(siteSlug: string, competitorInputs: string[]): Promise<LinkGapProspect[]> {
  const site = await getManagedSite(siteSlug);
  if (!site) throw new Error("Website not found.");
  const competitorHosts = [...new Set(competitorInputs.map(cleanCompetitorHost))].filter((host) => host !== site.host).slice(0, 10);
  if (!competitorHosts.length) throw new Error("Add at least one competitor domain.");
  const targets = Object.fromEntries(competitorHosts.map((host, index) => [String(index + 1), host]));
  const { result } = await getDataForSeoClient().post<Row>(
    "backlinksDomainIntersection",
    ENDPOINTS.backlinksDomainIntersection,
    [{ targets, exclude_targets: [site.host], limit: 500, order_by: ["rank,desc"], rank_scale: "one_hundred" }],
    { domainSlug: siteSlug },
  );
  const prospects = items(result).map((item): LinkGapProspect | null => {
    const sourceDomain = string(item.domain) ?? string(item.target) ?? string(item.main_domain);
    if (!sourceDomain) return null;
    const intersection = record(item.domain_intersection);
    const linked = Object.values(intersection).filter((value) => Object.keys(record(value)).length > 0).length;
    const authority = number(item.rank);
    return {
      sourceDomain,
      authority,
      relevance: Math.min(100, Math.round((linked / competitorHosts.length) * 60 + Math.min(authority ?? 0, 100) * 0.4)),
      reason: `Links to ${linked || "multiple"} selected competitor${linked === 1 ? "" : "s"}, but not ${site.host}.`,
      competitorHosts,
    };
  }).filter((item): item is LinkGapProspect => Boolean(item));
  for (let index = 0; index < prospects.length; index += 200) {
    await db().insert(schema.linkProspects).values(prospects.slice(index, index + 200).map((prospect) => ({ siteSlug, ...prospect })))
      .onConflictDoUpdate({
        target: [schema.linkProspects.siteSlug, schema.linkProspects.sourceDomain],
        set: { authority: sql`excluded.authority`, relevance: sql`excluded.relevance`, reason: sql`excluded.reason`, competitorHosts: sql`excluded.competitor_hosts`, updatedAt: sql`now()` },
      });
  }
  return prospects;
}
