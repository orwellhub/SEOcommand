import type { AiPlatform, AiPrompt, Backlink, Competitor, DomainId, Keyword, KeywordResearchRow, PositionBucket, RankSnapshot, ReferringDomain } from "@/lib/types";
import type { OnPageResult } from "@/lib/live";
import { DOMAINS } from "@/data/domains";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import type { BacklinkHistoryPoint, DetailedCrawlPage, KeywordGapRow, ManagedSite, TrackedRankingResult } from "@/platform/types";
import { getManagedSite, listAiTrackingPrompts, listRankTrackingKeywords } from "@/platform/site-store";
import { isoDate } from "@/lib/dates";
import { ENDPOINTS, locationFor, locationForSite, readConfig } from "./config";
import { MissingCredentialsError } from "./errors";
import { DataForSeoClient } from "./client";
import { InMemorySpendStore, SpendGuard, type SpendStore } from "./cost";
import { PgSpendStore } from "./store-db";
import {
  normalizeBacklinks,
  normalizeBacklinkHistory,
  normalizeCompetitors,
  normalizeDomainOverview,
  normalizeKeywordIdeas,
  normalizeOnPageHealth,
  normalizeOnPagePages,
  normalizeKeywordGaps,
  normalizeRankedKeywords,
  normalizeReferringDomains,
} from "./normalizers";

/**
 * Live DataForSEO access for the sync engine. Server-side only.
 *
 * Exposes bundle fetchers so ONE paid API call feeds every dataset it can
 * (e.g. ranked_keywords → both the keyword table and rank snapshots), keeping
 * spend minimal. Every call runs inside the monthly budget guardrail.
 */

function makeGuard(limitUsd: number): SpendGuard {
  let store: SpendStore = new InMemorySpendStore();
  if (process.env.DATABASE_URL) {
    store = new PgSpendStore();
  }
  return new SpendGuard(store, limitUsd);
}

let _client: DataForSeoClient | null = null;

export function dataForSeoConfigured(): boolean {
  return readConfig() !== null;
}

export function getDataForSeoClient(): DataForSeoClient {
  if (_client) return _client;
  const cfg = readConfig();
  if (!cfg) throw new MissingCredentialsError();
  _client = new DataForSeoClient(cfg, makeGuard(cfg.monthlyBudgetUsd));
  return _client;
}

async function siteFor(domainId: DomainId): Promise<ManagedSite> {
  const site = await getManagedSite(domainId);
  if (!site) throw new Error(`Unknown website "${domainId}".`);
  return site;
}

function labsBody(site: ManagedSite, extra: Record<string, unknown> = {}) {
  const loc = locationForSite(site);
  return [
    {
      target: site.host,
      location_code: loc.location_code,
      language_code: loc.language_code,
      limit: 200,
      ...extra,
    },
  ];
}

/** ranked_keywords once → keywords + rank snapshots. */
export async function fetchRankedKeywordsBundle(
  domainId: DomainId,
): Promise<{ keywords: Keyword[]; rankSnapshots: RankSnapshot[] }> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const { result } = await client.post(
    "labsRankedKeywords",
    ENDPOINTS.labsRankedKeywords,
    labsBody(site),
    { domainSlug: domainId },
  );
  const keywords = normalizeRankedKeywords(result as Record<string, unknown>[], domainId);
  const today = isoDate(new Date());
  const rankSnapshots: RankSnapshot[] = keywords
    .filter((k) => k.position != null)
    .map((k) => ({
      keywordId: k.id,
      keyword: k.keyword,
      date: today,
      position: k.position!,
      prevPosition: k.prevPosition ?? k.position!,
      device: "desktop",
      location: k.location,
      url: k.targetUrl ?? "",
      volume: k.volume,
      serpFeatures: k.serpFeatures,
      tags: [],
    }));
  return { keywords, rankSnapshots };
}

/**
 * Seed keyword research (not tied to a portfolio domain). One guarded Labs
 * "keyword_ideas" call returns the keyword universe around a seed term for a
 * chosen SERP market, with volume, keyword difficulty, CPC and competition.
 */
export async function researchKeywords(opts: {
  seed: string;
  locationCode: number;
  languageCode: string;
  limit?: number;
}): Promise<KeywordResearchRow[]> {
  const client = getDataForSeoClient();
  const { result } = await client.post(
    "labsKeywordIdeas",
    ENDPOINTS.labsKeywordIdeas,
    [
      {
        keywords: [opts.seed],
        location_code: opts.locationCode,
        language_code: opts.languageCode,
        limit: Math.min(Math.max(opts.limit ?? 100, 1), 1000),
        order_by: ["keyword_info.search_volume,desc"],
      },
    ],
    { domainSlug: null },
  );
  return normalizeKeywordIdeas(result as Record<string, unknown>[]);
}

/** domain_rank_overview once → visibility point + position buckets + est traffic. */
export async function fetchDomainOverviewBundle(
  domainId: DomainId,
): Promise<{ visibility: number; estTraffic: number; buckets: PositionBucket[] }> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const { result } = await client.post(
    "labsDomainRankOverview",
    ENDPOINTS.labsDomainRankOverview,
    labsBody(site),
    { domainSlug: domainId },
  );
  return normalizeDomainOverview(result as Record<string, unknown>[]);
}

export async function fetchCompetitors(domainId: DomainId): Promise<Competitor[]> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const { result } = await client.post(
    "labsCompetitorsDomain",
    ENDPOINTS.labsCompetitorsDomain,
    labsBody(site),
    { domainSlug: domainId },
  );
  return normalizeCompetitors(result as Record<string, unknown>[], domainId).slice(0, 25);
}

export async function fetchBacklinks(domainId: DomainId): Promise<Backlink[]> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const links: Backlink[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < site.backlinkLimit; offset += pageSize) {
    const { result } = await client.post(
      "backlinksList",
      ENDPOINTS.backlinksList,
      [{ target: site.host, limit: Math.min(pageSize, site.backlinkLimit - offset), offset, mode: "as_is" }],
      { domainSlug: domainId },
    );
    const page = normalizeBacklinks(result as Record<string, unknown>[], domainId);
    links.push(...page);
    if (page.length < pageSize) break;
  }
  return links.map((link, index) => ({ ...link, id: `${domainId}-dfs-bl-${index + 1}` }));
}

export async function fetchReferringDomains(domainId: DomainId): Promise<ReferringDomain[]> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const { result } = await client.post(
    "backlinksReferringDomains",
    ENDPOINTS.backlinksReferringDomains,
    [{ target: site.host, limit: 1000 }],
    { domainSlug: domainId },
  );
  return normalizeReferringDomains(result as Record<string, unknown>[], domainId);
}

export async function fetchBacklinkHistory(domainId: DomainId): Promise<BacklinkHistoryPoint[]> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - 7);
  const { result } = await client.post(
    "backlinksHistory",
    ENDPOINTS.backlinksHistory,
    [{ target: site.host, date_from: isoDate(from), date_to: isoDate(new Date()) }],
    { domainSlug: domainId },
  );
  return normalizeBacklinkHistory(result as Record<string, unknown>[]);
}

export async function fetchKeywordGap(
  domainId: DomainId,
  competitorHost: string,
  limit = 500,
): Promise<KeywordGapRow[]> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  const location = locationForSite(site);
  const { result } = await client.post(
    "labsDomainIntersection",
    ENDPOINTS.labsDomainIntersection,
    [{
      target1: competitorHost,
      target2: site.host,
      ...location,
      intersections: false,
      item_types: ["organic", "featured_snippet", "local_pack"],
      limit: Math.min(Math.max(limit, 1), 1000),
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
    }],
    { domainSlug: domainId },
  );
  return normalizeKeywordGaps(result as Record<string, unknown>[], competitorHost);
}

/**
 * OnPage crawl with cross-run resume. Pass the pending task id from the last
 * sync (if any): a finished crawl returns the normalised result, an unfinished
 * one returns { status: "pending" } without paying for a new task.
 */
export async function ensureOnPageCrawl(
  domainId: DomainId,
  pendingTaskId: string | null,
): Promise<
  | { status: "pending"; taskId: string }
  | { status: "finished"; taskId: string; result: OnPageResult; pages: DetailedCrawlPage[] }
> {
  const client = getDataForSeoClient();
  const site = await siteFor(domainId);
  let taskId = pendingTaskId;
  if (!taskId) {
    const posted = await client.postOnPageTask(site.host, {
      maxPages: site.crawlMaxPages,
      domainSlug: domainId,
    });
    taskId = posted.taskId;
  }
  const summary = await client.fetchOnPageSummary(taskId);
  if (summary?.["crawl_progress"] !== "finished") {
    return { status: "pending", taskId };
  }
  const norm = normalizeOnPageHealth(summary, isoDate(new Date()));
  const pages: DetailedCrawlPage[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < site.crawlMaxPages; offset += pageSize) {
    const raw = await client.fetchOnPagePages(taskId, Math.min(pageSize, site.crawlMaxPages - offset), offset);
    const page = normalizeOnPagePages(raw);
    pages.push(...page);
    if (page.length < pageSize) break;
  }
  for (const issue of norm.issues) {
    const checkKey = issue.id.replace("onpage-", "");
    issue.samplePages = pages.filter((page) => Boolean(page.checks[checkKey])).slice(0, 10).map((page) => page.url);
  }
  norm.issues.forEach((i) => (i.domainId = domainId));
  if (norm.crawlRun) norm.crawlRun.domainId = domainId;
  return {
    status: "finished",
    taskId,
    result: {
      breakdown: norm.breakdown,
      crawlRun: norm.crawlRun,
      issues: norm.issues,
      healthScore: norm.healthScore,
    },
    pages,
  };
}

/**
 * Run the domain's tracked prompts through the LLM Responses API and measure
 * real mention/citation. Only domains present in TRACKED_AI_PROMPTS run (cost
 * control); returns null for others.
 */
export async function fetchAiPromptResults(domainId: DomainId): Promise<AiPrompt[] | null> {
  const site = await siteFor(domainId);
  const stored = await listAiTrackingPrompts(domainId);
  const tracked = stored.length
    ? stored.map((item) => ({ prompt: item.prompt, topic: item.topic, platforms: item.platforms }))
    : (TRACKED_AI_PROMPTS[domainId] ?? []).map((item) => ({ ...item, platforms: ["chatgpt"] }));
  if (!tracked || tracked.length === 0) return null;
  const client = getDataForSeoClient();
  const brand = site.name.toLowerCase();
  const host = site.host.toLowerCase();
  const out: AiPrompt[] = [];
  const platformConfig = {
    chatgpt: { path: "chat_gpt" as const, model: process.env.DATAFORSEO_AI_MODEL_CHATGPT ?? "gpt-4o" },
    claude: { path: "claude" as const, model: process.env.DATAFORSEO_AI_MODEL_CLAUDE ?? "claude-sonnet-4-0" },
    gemini: { path: "gemini" as const, model: process.env.DATAFORSEO_AI_MODEL_GEMINI ?? "gemini-2.5-flash" },
    perplexity: { path: "perplexity" as const, model: process.env.DATAFORSEO_AI_MODEL_PERPLEXITY ?? "sonar" },
  };
  for (const [i, p] of tracked.entries()) {
    for (const platform of p.platforms.filter((value) => value in platformConfig)) {
      const key = platform as keyof typeof platformConfig;
      const cfg = platformConfig[key];
      const { result } = await client.post<Record<string, any>>(
        "aiLlmResponses",
        ENDPOINTS.aiLlmResponses(cfg.path),
        [{ user_prompt: p.prompt, model_name: cfg.model, max_output_tokens: 800 }],
        { domainSlug: domainId },
      );
      const items = (result?.[0] as any)?.items ?? result ?? [];
      const text = JSON.stringify(items).toLowerCase();
      const mentioned = text.includes(brand.replace(/\s+/g, "")) || text.includes(brand) || text.includes(host);
      const cited = text.includes(host);
      const snippet = extractResponseText(items).slice(0, 600);
      out.push({
        id: `${domainId}-ai-${i + 1}-${key}`,
        domainId,
        prompt: p.prompt,
        topic: p.topic,
        platforms: [key as AiPlatform],
        mentionRate: mentioned ? 100 : 0,
        citationRate: cited ? 100 : 0,
        avgPosition: null,
        sentiment: "neutral",
        lastChecked: isoDate(new Date()),
        competitorsMentioned: [],
        cited,
        sampleResponse: snippet || (mentioned
          ? `${site.name} was referenced in the live ${key} response.`
          : `${site.name} was not referenced in the live ${key} response — coverage gap.`),
      });
    }
  }
  return out;
}

/** Daily exact SERP checks for approved, explicitly tracked keywords. */
export async function fetchDailyTrackedRankings(domainId: DomainId): Promise<TrackedRankingResult[]> {
  const site = await siteFor(domainId);
  const tracked = await listRankTrackingKeywords(domainId);
  if (!tracked.length) return [];
  const client = getDataForSeoClient();
  const results: TrackedRankingResult[] = [];
  for (let offset = 0; offset < tracked.length; offset += 10) {
    const batch = tracked.slice(offset, offset + 10);
    const pulled = await Promise.all(batch.map(async (keyword) => {
      const { result } = await client.post<Record<string, any>>(
        "serpOrganicLive",
        ENDPOINTS.serpOrganicLive,
        [{ keyword: keyword.keyword, location_code: keyword.locationCode, language_code: keyword.languageCode, device: keyword.device, depth: 100 }],
        { domainSlug: domainId, critical: true },
      );
      const root = result?.[0] as any;
      const items: any[] = root?.items ?? [];
      const owned = items.find((item) => {
        const candidate = String(item?.domain ?? item?.url ?? "").toLowerCase();
        return candidate.includes(site.host.toLowerCase());
      });
      return {
        trackedKeywordId: keyword.id,
        keyword: keyword.keyword,
        device: keyword.device,
        locationCode: keyword.locationCode,
        position: owned?.rank_absolute ?? null,
        previousPosition: null,
        url: owned?.url ?? null,
        serpFeatures: [...new Set(items.map((item) => String(item?.type ?? "")).filter(Boolean))],
      } satisfies TrackedRankingResult;
    }));
    results.push(...pulled);
  }
  return results;
}

function extractResponseText(items: unknown): string {
  try {
    const arr = Array.isArray(items) ? items : [items];
    for (const it of arr) {
      const sections = (it as any)?.sections;
      if (Array.isArray(sections)) {
        const text = sections
          .map((s: any) => s?.text ?? "")
          .filter(Boolean)
          .join(" ");
        if (text) return text;
      }
      const direct = (it as any)?.text ?? (it as any)?.content;
      if (typeof direct === "string" && direct) return direct;
    }
  } catch {
    /* best effort */
  }
  return "";
}

/** Lightweight credential + budget probe for the go-live health check. */
export async function probeDataForSeo(): Promise<{
  configured: boolean;
  spend?: Awaited<ReturnType<DataForSeoClient["guardStatus"]>>;
  models?: number;
  locations?: Record<string, { locationCode?: number; languageCode?: string; error?: string }>;
  error?: string;
}> {
  const cfg = readConfig();
  if (!cfg) return { configured: false };
  const client = new DataForSeoClient(cfg, makeGuard(cfg.monthlyBudgetUsd));
  const locations = Object.fromEntries(
    DOMAINS.map((domain) => {
      try {
        const location = locationFor(domain.id);
        return [
          domain.id,
          { locationCode: location.location_code, languageCode: location.language_code },
        ];
      } catch (error) {
        return [domain.id, { error: error instanceof Error ? error.message : String(error) }];
      }
    }),
  );
  try {
    const modelLists = await Promise.all([
      "chat_gpt",
      "claude",
      "gemini",
      "perplexity",
    ].map((platform) => client.getMeta<unknown>(ENDPOINTS.aiLlmModels(platform as "chat_gpt" | "claude" | "gemini" | "perplexity"))));
    let spend: Awaited<ReturnType<DataForSeoClient["guardStatus"]>> | undefined;
    try {
      spend = await client.guardStatus();
    } catch {
      spend = undefined;
    }
    return { configured: true, spend, models: modelLists.reduce((sum, models) => sum + models.length, 0), locations };
  } catch (err) {
    return { configured: true, locations, error: err instanceof Error ? err.message : String(err) };
  }
}
