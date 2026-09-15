import { DEFAULT_KEYWORD_QUERY, KeywordQuerySchema, providerKeywordQuery, type KeywordQuery } from "@/lib/keyword-query";
import {belongsToHost} from "@/lib/rank-reports";
import type { AiPlatform, AiPrompt, Backlink, Competitor, DomainId, Keyword, KeywordResearchRow, KeywordResearchResult, PositionBucket, RankSnapshot, ReferringDomain } from "@/lib/types";
import type { OnPageResult } from "@/lib/live";
import { DOMAINS } from "@/data/domains";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import type {
  AiObservationInput,
  AiVisibilityPlatform,
  AiVisibilityRun,
  BacklinkHistoryPoint,
  DetailedCrawlPage,
  KeywordGapRow,
  ManagedSite,
  TrackedRankingResult,
} from "@/platform/types";
import { analyseAiResponse } from "@/platform/ai-analysis";
import { ensureRegistryAiTrackingPrompts, getManagedSite, listAiTrackingPrompts, listDueAiTrackingPrompts, listRankTrackingKeywords, markAiPromptRun } from "@/platform/site-store";
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
    labsBody(site, { item_types: ["organic"] }),
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
      prevPosition: k.prevPosition,
      device: "desktop",
      location: k.location,
      url: k.targetUrl ?? "",
      volume: k.volume,
      serpFeatures: k.serpFeatures,
      tags: [],
    }));
  return { keywords, rankSnapshots };
}

/** Keyword discovery applies its match, filters and order in the provider database. */
export async function researchKeywords(opts: {
  seed: string;
  sourceType?: "seed" | "domain" | "competitor" | "questions" | "related";
  onWarning?: (message: string) => void;
  offset?: number;
  offsetToken?: string;
  query?: KeywordQuery;
  onPrimary?: (row: KeywordResearchRow) => void;
  onPagination?: (page: NonNullable<KeywordResearchResult["pagination"]>) => void;
  siteSlug?: string | null;
  locationCode: number;
  languageCode: string;
  limit?: number;
}): Promise<KeywordResearchRow[]> {
  const client = getDataForSeoClient();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const query = KeywordQuerySchema.parse({...DEFAULT_KEYWORD_QUERY, ...opts.query, ...(opts.sourceType === "questions" ? {questions:true} : {}), ...(opts.sourceType === "related" ? {match:"related"} : {})});
  const nested = query.match === "related" || opts.sourceType === "domain" || opts.sourceType === "competitor";
  const clauses = providerKeywordQuery(opts.seed, query, nested, opts.languageCode);
  const common = {location_code: opts.locationCode, language_code: opts.languageCode, limit, offset, ...(opts.offsetToken ? {offset_token:opts.offsetToken} : {}), include_serp_info:true, ...clauses};
  let endpoint: "labsKeywordSuggestions" | "labsRelatedKeywords" | "labsRankedKeywords" = "labsKeywordSuggestions";
  let task: Record<string, unknown>;
  if (opts.sourceType === "domain" || opts.sourceType === "competitor") {
    let target: string;
    try { target = new URL(opts.seed.includes("://") ? opts.seed : `https://${opts.seed}`).hostname; } catch { throw new Error("Enter a valid domain or website URL."); }
    if (!target.includes(".")) throw new Error("Enter a valid domain or website URL.");
    endpoint = "labsRankedKeywords";
    task = {...common, target, item_types:["organic"]};
  } else if (query.match === "related") {
    endpoint = "labsRelatedKeywords";
    task = {...common, keyword:opts.seed, depth:3};
  } else {
    task = {...common, keyword:opts.seed, include_seed_keyword:offset === 0, exact_match:query.match === "exact", ignore_synonyms:false};
  }
  const {result} = await client.post<Record<string, unknown>>(endpoint, ENDPOINTS[endpoint], [task], {domainSlug:opts.siteSlug ?? null});
  const root = result[0];
  if (!root || (!Array.isArray(root.items) && root.total_count !== 0)) throw new Error("The provider did not return a valid keyword report. Your previous collection is still available.");
  const items = (root.items ?? []) as Record<string, unknown>[];
  const total = typeof root.total_count === "number" ? root.total_count : null;
  opts.onPagination?.({nextOffset:offset + items.length, total, hasMore:items.length > 0 && (total == null ? items.length >= limit : offset + items.length < total), sourceType:opts.sourceType ?? "seed", ...(typeof root.offset_token === "string" ? {nextToken:root.offset_token} : {})});
  if (root.seed_keyword_data) {
    const primary = normalizeKeywordIdeas([{items:[root.seed_keyword_data]}])[0];
    if (primary) opts.onPrimary?.(primary);
  }
  // The exact seed is report metadata, never an extra row inserted into a filtered page.
  return normalizeKeywordIdeas([{items:items.map(item => nested ? item.keyword_data ?? item : item)}]).map(row => query.match === "related" ? {...row, relatedToSeed:true} : row);
}

export async function keywordMetrics(keywords: string[], locationCode: number, languageCode: string, siteSlug?: string | null) {
  if (!keywords.length || keywords.length > 700) throw new Error("Analyze between 1 and 700 keywords at a time.");
  const {result} = await getDataForSeoClient().post<Record<string, unknown>>("labsKeywordOverview", ENDPOINTS.labsKeywordOverview, [{keywords, location_code:locationCode, language_code:languageCode, include_serp_info:true}], {domainSlug:siteSlug ?? null});
  if (!result.length) throw new Error("The provider did not return keyword metrics.");
  return normalizeKeywordIdeas(result);
}

export async function keywordGlobalVolume(keyword: string, siteSlug?: string | null): Promise<NonNullable<NonNullable<KeywordResearchResult["report"]>["global"]>> {
  const {result} = await getDataForSeoClient().post<Record<string, unknown>>("keywordGlobalVolume", ENDPOINTS.keywordGlobalVolume, [{keywords:[keyword]}], {domainSlug:siteSlug ?? null});
  const items = (result[0]?.items ?? []) as Record<string, unknown>[];
  const item = items.find(row => String(row.keyword).toLowerCase() === keyword.toLowerCase());
  if (!item) throw new Error("Global search volume is not available for this keyword.");
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return {volume:number(item.search_volume), countries:((item.country_distribution ?? []) as Record<string, unknown>[]).map(row => ({code:String(row.country_iso_code), volume:number(row.search_volume), percentage:number(row.percentage)})).sort((a,b) => (b.volume ?? -1) - (a.volume ?? -1)), fetchedAt:new Date().toISOString(), source:"clickstream"};
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
    labsBody(site, { item_types: ["organic"] }),
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
export async function fetchAiPromptResults(
  domainId: DomainId,
  competitors: { name?: string; host: string }[] = [],
): Promise<AiVisibilityRun | null> {
  const site = await siteFor(domainId);
  let storedAll = await listAiTrackingPrompts(domainId);
  const registryPrompts = TRACKED_AI_PROMPTS[domainId] ?? [];
  if (!storedAll.length && registryPrompts.length) {
    storedAll = await ensureRegistryAiTrackingPrompts(domainId, registryPrompts);
  }
  const stored = storedAll.length ? await listDueAiTrackingPrompts(domainId) : [];
  const tracked = stored.length
    ? stored.map((item) => ({
        id: item.id,
        prompt: item.prompt,
        topic: item.topic,
        platforms: item.platforms,
        sampleCount: item.sampleCount,
        cadence: item.cadence,
        locationCode: item.locationCode,
        languageCode: item.languageCode,
      }))
    : storedAll.length
      ? []
      : registryPrompts.map((item) => ({
          ...item,
          id: null,
          platforms: ["chatgpt"],
          sampleCount: 1,
          cadence: "weekly",
          locationCode: site.dataForSeoLocationCode,
          languageCode: site.dataForSeoLanguageCode,
        }));
  if (!tracked || tracked.length === 0) return null;
  const client = getDataForSeoClient();
  const out: AiPrompt[] = [];
  const observations: AiObservationInput[] = [];
  const skippedPlatforms: AiVisibilityRun["skippedPlatforms"] = [];
  const platformConfig = {
    chatgpt: { path: "chat_gpt" as const, model: process.env.DATAFORSEO_AI_MODEL_CHATGPT ?? "gpt-4o" },
    claude: { path: "claude" as const, model: process.env.DATAFORSEO_AI_MODEL_CLAUDE ?? "claude-sonnet-4-0" },
    gemini: { path: "gemini" as const, model: process.env.DATAFORSEO_AI_MODEL_GEMINI ?? "gemini-2.5-flash" },
    perplexity: { path: "perplexity" as const, model: process.env.DATAFORSEO_AI_MODEL_PERPLEXITY ?? "sonar" },
  };
  for (const [i, p] of tracked.entries()) {
    const observationCountBeforePrompt = observations.length;
    for (const platformValue of p.platforms) {
      const platform = platformValue as AiVisibilityPlatform;
      for (let sampleIndex = 0; sampleIndex < Math.max(1, p.sampleCount); sampleIndex += 1) {
        let raw: unknown;
        let modelName: string = platform;
        let costUsd = 0;
        if (platform in platformConfig) {
          const key = platform as keyof typeof platformConfig;
          const cfg = platformConfig[key];
          modelName = cfg.model;
          const call = await client.post<Record<string, any>>(
            "aiLlmResponses",
            ENDPOINTS.aiLlmResponses(cfg.path),
            [{
              user_prompt: p.prompt,
              model_name: cfg.model,
              max_output_tokens: 1200,
              web_search: true,
              force_web_search: true,
            }],
            { domainSlug: domainId },
          );
          const { result } = call;
          costUsd = call.costUsd;
          raw = result?.[0] ?? result ?? {};
        } else if (platform === "google_ai_overview" || platform === "google_ai_mode") {
          const endpointKey = platform === "google_ai_mode" ? "googleAiModeLive" : "serpOrganicLive";
          const endpoint = platform === "google_ai_mode" ? ENDPOINTS.googleAiModeLive : ENDPOINTS.serpOrganicLive;
          const call = await client.post<Record<string, any>>(
            endpointKey,
            endpoint,
            [{
              keyword: p.prompt,
              location_code: p.locationCode ?? site.dataForSeoLocationCode,
              language_code: p.languageCode || site.dataForSeoLanguageCode,
              device: "desktop",
              depth: 20,
            }],
            { domainSlug: domainId },
          );
          const { result } = call;
          costUsd = call.costUsd;
          raw = result?.[0] ?? result ?? {};
          modelName = platform === "google_ai_mode" ? "Google AI Mode" : "Google AI Overview";
        } else if (platform === "copilot") {
          const webhook = process.env.AI_COPILOT_WEBHOOK_URL;
          if (!webhook) {
            if (!skippedPlatforms.some((item) => item.platform === platform)) {
              skippedPlatforms.push({ platform, reason: "AI_COPILOT_WEBHOOK_URL is not configured." });
            }
            break;
          }
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (process.env.AI_COPILOT_WEBHOOK_SECRET) {
            headers.authorization = `Bearer ${process.env.AI_COPILOT_WEBHOOK_SECRET}`;
          }
          const response = await fetch(webhook, {
            method: "POST",
            headers,
            body: JSON.stringify({ prompt: p.prompt, site: site.host, sampleIndex }),
          });
          if (!response.ok) throw new Error(`Copilot adapter returned ${response.status}.`);
          raw = await response.json();
          const rawCost = (raw as { costUsd?: unknown })?.costUsd;
          costUsd = typeof rawCost === "number" && Number.isFinite(rawCost) ? rawCost : 0;
          modelName = "Microsoft Copilot";
        } else {
          continue;
        }

        const observation = analyseAiResponse({
          promptId: p.id,
          siteSlug: domainId,
          siteName: site.name,
          siteHost: site.host,
          prompt: p.prompt,
          topic: p.topic,
          platform,
          modelName,
          sampleIndex,
          capturedOn: isoDate(new Date()),
          raw,
          competitors,
          costUsd,
        });
        if (platform === "google_ai_overview" || platform === "google_ai_mode") {
          observation.raw = { ...(observation.raw as Record<string, unknown>), collection: { locationCode: p.locationCode ?? site.dataForSeoLocationCode, languageCode: p.languageCode || site.dataForSeoLanguageCode } };
        }
        observations.push(observation);
        out.push({
          id: `${domainId}-ai-${i + 1}-${platform}-${sampleIndex}`,
          domainId,
          prompt: p.prompt,
          topic: p.topic,
          platforms: [platform as AiPlatform],
          mentionRate: observation.mentioned ? 100 : 0,
          citationRate: observation.cited ? 100 : 0,
          avgPosition: observation.recommendationPosition,
          sentiment: observation.sentiment,
          lastChecked: observation.capturedOn,
          competitorsMentioned: observation.entities.filter((item) => !item.owned).map((item) => item.name),
          cited: observation.cited,
          sampleResponse: observation.responseText.slice(0, 1200) || `${site.name} was not returned in the measured response.`,
        });
      }
    }
    if (p.id && observations.length > observationCountBeforePrompt) await markAiPromptRun(p.id, p.cadence);
  }
  return { prompts: out, observations, skippedPlatforms };
}

/** Daily exact SERP checks for approved, explicitly tracked keywords. */
export async function fetchDailyTrackedRankings(domainId: DomainId,onBatch?:(rows:TrackedRankingResult[])=>Promise<void>): Promise<TrackedRankingResult[]> {
  const site = await siteFor(domainId);
  const tracked = await listRankTrackingKeywords(domainId);
  if (!tracked.length) return [];
  const client = getDataForSeoClient();
  const results: TrackedRankingResult[] = [];
  for (let offset = 0; offset < tracked.length; offset += 10) {
    const batch = tracked.slice(offset, offset + 10);
    const pulled = await Promise.allSettled(batch.map(async (keyword) => {
      const { result } = await client.post<Record<string, any>>(
        "serpOrganicLive",
        ENDPOINTS.serpOrganicLive,
        [{ keyword: keyword.keyword, location_code: keyword.locationCode, language_code: keyword.languageCode, device: keyword.device, depth: 100 }],
        { domainSlug: domainId, critical: true },
      );
      const root = result?.[0] as any;
      if(!root||!Array.isArray(root.items)&&root.items_count!==0)throw new Error("The provider did not return a valid SERP. Previously completed targets remain saved.");
      const items: any[] = root.items ?? [];
      const owned = items.find((item) => {
        const candidate = String(item?.domain ?? item?.url ?? "").toLowerCase();
        return item?.type === "organic" && belongsToHost(candidate, site.host);
      });
      const organic = items.filter((item) => item?.type === "organic" && item?.rank_absolute);
      const hosts = organic.map((item) => { try { return new URL(String(item?.url ?? "")).hostname.replace(/^www\./, ""); } catch { return String(item?.domain ?? "").replace(/^www\./, ""); } });
      const topCompetitors = organic.map((item, index) => ({ host: hosts[index]!, position: Number(item.rank_absolute), url: item?.url ? String(item.url) : null })).filter((item) => item.host && !belongsToHost(item.host,site.host));
      const keywordText = keyword.keyword.toLowerCase();
      const featureTypes = new Set(items.map((item) => String(item?.type ?? "")));
      const inferredIntent = [...featureTypes].some((type) => /shopping|local_pack|maps|paid/.test(type)) ? "transactional" : [...featureTypes].some((type) => /knowledge|people_also_ask|featured_snippet/.test(type)) && !/\b(buy|price|quote|book|hire|near me)\b/.test(keywordText) ? "informational" : /\b(buy|price|quote|book|hire|near me)\b/.test(keywordText) ? "transactional" : /\b(best|compare|review|vs|top)\b/.test(keywordText) ? "commercial" : /\b(how|what|why|guide|can|does)\b/.test(keywordText) ? "informational" : "mixed";
      return {
        trackedKeywordId: keyword.id,
        keyword: keyword.keyword,
        device: keyword.device,
        locationCode: keyword.locationCode,
        position: owned?.rank_absolute ?? null,
        previousPosition: null,
        url: owned?.url ?? null,
        serpFeatures: [...new Set(items.map((item) => String(item?.type ?? "")).filter(Boolean))],
        ownedFeatures: [...new Set(items.filter(item=>item?.type!=="organic" && belongsToHost(String(item?.domain??item?.url??""),site.host)).map(item=>String(item.type)))],
        intent: inferredIntent,
        competitors: [...new Map(topCompetitors.map(item=>[item.host,topCompetitors.find(first=>first.host===item.host)!])).values()],
      } satisfies TrackedRankingResult;
    }));
    const completed=pulled.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);
    if(completed.length&&onBatch)await onBatch(completed);
    results.push(...completed);
    const failed=pulled.find(result=>result.status==="rejected");if(failed?.status==="rejected")throw failed.reason;
  }
  return results;
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
