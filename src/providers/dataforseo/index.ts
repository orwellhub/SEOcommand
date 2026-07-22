import type { AiPrompt, Backlink, Competitor, DomainId, Keyword, PositionBucket, RankSnapshot, ReferringDomain } from "@/lib/types";
import type { OnPageResult } from "@/lib/live";
import { DOMAIN_MAP } from "@/data/domains";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { isoDate } from "@/lib/dates";
import { ENDPOINTS, locationFor, readConfig } from "./config";
import { MissingCredentialsError } from "./errors";
import { DataForSeoClient } from "./client";
import { InMemorySpendStore, SpendGuard, type SpendStore } from "./cost";
import { PgSpendStore } from "./store-db";
import {
  normalizeBacklinks,
  normalizeCompetitors,
  normalizeDomainOverview,
  normalizeOnPageHealth,
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

function labsBody(domainId: DomainId, extra: Record<string, unknown> = {}) {
  const loc = locationFor(domainId);
  return [
    {
      target: DOMAIN_MAP[domainId].host,
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
  const { result } = await client.post(
    "labsRankedKeywords",
    ENDPOINTS.labsRankedKeywords,
    labsBody(domainId),
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

/** domain_rank_overview once → visibility point + position buckets + est traffic. */
export async function fetchDomainOverviewBundle(
  domainId: DomainId,
): Promise<{ visibility: number; estTraffic: number; buckets: PositionBucket[] }> {
  const client = getDataForSeoClient();
  const { result } = await client.post(
    "labsDomainRankOverview",
    ENDPOINTS.labsDomainRankOverview,
    labsBody(domainId),
    { domainSlug: domainId },
  );
  return normalizeDomainOverview(result as Record<string, unknown>[]);
}

export async function fetchCompetitors(domainId: DomainId): Promise<Competitor[]> {
  const client = getDataForSeoClient();
  const { result } = await client.post(
    "labsCompetitorsDomain",
    ENDPOINTS.labsCompetitorsDomain,
    labsBody(domainId),
    { domainSlug: domainId },
  );
  return normalizeCompetitors(result as Record<string, unknown>[], domainId).slice(0, 25);
}

export async function fetchBacklinks(domainId: DomainId): Promise<Backlink[]> {
  const client = getDataForSeoClient();
  const { result } = await client.post(
    "backlinksList",
    ENDPOINTS.backlinksList,
    [{ target: DOMAIN_MAP[domainId].host, limit: 250, mode: "as_is" }],
    { domainSlug: domainId },
  );
  return normalizeBacklinks(result as Record<string, unknown>[], domainId);
}

export async function fetchReferringDomains(domainId: DomainId): Promise<ReferringDomain[]> {
  const client = getDataForSeoClient();
  const { result } = await client.post(
    "backlinksReferringDomains",
    ENDPOINTS.backlinksReferringDomains,
    [{ target: DOMAIN_MAP[domainId].host, limit: 250 }],
    { domainSlug: domainId },
  );
  return normalizeReferringDomains(result as Record<string, unknown>[], domainId);
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
  | { status: "finished"; taskId: string; result: OnPageResult }
> {
  const client = getDataForSeoClient();
  let taskId = pendingTaskId;
  if (!taskId) {
    const posted = await client.postOnPageTask(DOMAIN_MAP[domainId].host, {
      maxPages: 200,
      domainSlug: domainId,
    });
    taskId = posted.taskId;
  }
  const summary = await client.fetchOnPageSummary(taskId);
  if (summary?.["crawl_progress"] !== "finished") {
    return { status: "pending", taskId };
  }
  const norm = normalizeOnPageHealth(summary, isoDate(new Date()));
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
  };
}

/**
 * Run the domain's tracked prompts through the LLM Responses API and measure
 * real mention/citation. Only domains present in TRACKED_AI_PROMPTS run (cost
 * control); returns null for others.
 */
export async function fetchAiPromptResults(domainId: DomainId): Promise<AiPrompt[] | null> {
  const tracked = TRACKED_AI_PROMPTS[domainId];
  if (!tracked || tracked.length === 0) return null;
  const client = getDataForSeoClient();
  const brand = DOMAIN_MAP[domainId].name.toLowerCase();
  const host = DOMAIN_MAP[domainId].host.toLowerCase();
  const out: AiPrompt[] = [];
  for (const [i, p] of tracked.entries()) {
    const { result } = await client.post<Record<string, any>>(
      "aiLlmResponses",
      ENDPOINTS.aiLlmResponses,
      [{ user_prompt: p.prompt, model_name: "gpt-4o", max_output_tokens: 800 }],
      { domainSlug: domainId },
    );
    const items = (result?.[0] as any)?.items ?? result ?? [];
    const text = JSON.stringify(items).toLowerCase();
    const mentioned = text.includes(brand.replace(/\s+/g, "")) || text.includes(brand) || text.includes(host);
    const cited = text.includes(host);
    const snippet = extractResponseText(items).slice(0, 600);
    out.push({
      id: `${domainId}-ai-${i + 1}`,
      domainId,
      prompt: p.prompt,
      topic: p.topic,
      platforms: ["chatgpt"],
      mentionRate: mentioned ? 100 : 0,
      citationRate: cited ? 100 : 0,
      avgPosition: null,
      sentiment: "neutral",
      lastChecked: isoDate(new Date()),
      competitorsMentioned: [],
      cited,
      sampleResponse:
        snippet ||
        (mentioned
          ? `${DOMAIN_MAP[domainId].name} was referenced in the live AI response.`
          : `${DOMAIN_MAP[domainId].name} was not referenced in the live AI response — coverage gap.`),
    });
  }
  return out;
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
  error?: string;
}> {
  const cfg = readConfig();
  if (!cfg) return { configured: false };
  const client = new DataForSeoClient(cfg, makeGuard(cfg.monthlyBudgetUsd));
  try {
    const models = await client.getMeta<unknown>(ENDPOINTS.aiLlmModels);
    let spend: Awaited<ReturnType<DataForSeoClient["guardStatus"]>> | undefined;
    try {
      spend = await client.guardStatus();
    } catch {
      spend = undefined;
    }
    return { configured: true, spend, models: models.length };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : String(err) };
  }
}
