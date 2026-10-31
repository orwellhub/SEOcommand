import { z } from "zod/v4";
import { GET as getLiveDomain } from "@/app/api/live/[domainId]/route";
import { GET as getKeywordStrategyRoute } from "@/app/api/keyword-strategy/route";
import { GET as getMarketIntelligenceRoute } from "@/app/api/market-intelligence/route";
import { GET as getAiVisibilityRoute } from "@/app/api/ai-visibility/route";
import { GET as getRankReportRoute } from "@/app/api/rank-tracking/report/route";
import type { DomainLiveBundle } from "@/lib/live";
import { volumeKey } from "@/lib/rank-intelligence";
import { loadCollectionHealth, type CollectionHealthItem } from "@/platform/collection-health";
import { listManagedSites } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";
import { mcpBudgetStatus, overallBudgetStatus, spendByActor } from "../budget";
import { callRouteOrThrow, McpToolError } from "../internal";
import { defineTool, freshness, iso, limitArg, offsetArg, page, requireSite, round, siteArg } from "./shared";

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/* -------------------------------- list_sites ------------------------------ */

export const listSites = defineTool({
  name: "list_sites",
  title: "List sites",
  description: "List every website managed in SEO Command with its slug, host, market, Google properties and spend approval. Use the slug as `site` in other tools. Free.",
  kind: "read",
  input: z.object({}),
  annotations: READ,
  async run() {
    const sites = await listManagedSites();
    return {
      data: {
        count: sites.length,
        sites: sites.map((site) => ({
          slug: site.id,
          name: site.name,
          host: site.host,
          industry: site.industry,
          primaryMarket: site.primaryMarket,
          locationCode: site.dataForSeoLocationCode,
          languageCode: site.dataForSeoLanguageCode,
          gscProperty: site.gscSite || null,
          ga4Property: site.ga4PropertyId ?? null,
          lifecycleStatus: site.lifecycleStatus,
          spendApproval: site.spendApproval,
          approvedMonthlyUsd: site.approvedMonthlyUsd,
          source: site.source,
        })),
        generatedAt: new Date().toISOString(),
      },
    };
  },
});

/* ------------------------------ get_site_live ----------------------------- */

export const LIVE_SECTIONS = [
  "striking_distance",
  "gsc_query_pages",
  "page_movers",
  "query_movers",
  "ranked_keywords",
  "keyword_gaps",
  "competitors",
  "recommendations",
] as const;
type LiveSection = (typeof LIVE_SECTIONS)[number];

function moverSection(ds: DomainLiveBundle["datasets"]["gsc_movers"], limit: number, offset: number) {
  if (!ds) return { status: "awaiting_first_sync" };
  return { freshness: freshness(ds), gains: page(ds.data?.gains, limit, offset), losses: page(ds.data?.losses, limit, offset) };
}

type StoredList<T> = { data: T[] | null | undefined } & NonNullable<Parameters<typeof freshness>[0]>;

function liveSection(bundle: DomainLiveBundle, section: LiveSection, limit: number, offset: number) {
  const d = bundle.datasets;
  const listSection = <T, R>(ds: StoredList<T> | undefined, map: (row: T) => R) => {
    if (!ds) return { status: "awaiting_first_sync" };
    return { freshness: freshness(ds), ...page((ds.data ?? []).map(map), limit, offset) };
  };
  switch (section) {
    case "striking_distance":
      return listSection(d.striking_distance, (row) => row);
    case "gsc_query_pages":
      return listSection(d.gsc_query_pages, (row) => ({ query: row.query, page: row.page, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: round(row.position, 1) }));
    case "page_movers":
      return moverSection(d.gsc_page_movers, limit, offset);
    case "query_movers":
      return moverSection(d.gsc_movers, limit, offset);
    case "ranked_keywords":
      return listSection(d.keywords, (row) => ({
        keyword: row.keyword,
        position: row.position,
        previousPosition: row.prevPosition,
        volume: row.volume,
        difficulty: row.difficulty,
        cpc: row.cpc,
        intent: row.intent,
        url: row.targetUrl,
        trafficPotential: row.trafficPotential,
        serpFeatures: row.serpFeatures,
      }));
    case "keyword_gaps":
      return listSection(d.keyword_gaps, (row) => row);
    case "competitors":
      return listSection(d.competitors, (row) => ({ host: row.host, commonKeywords: row.commonKeywords, keywords: row.keywords, authority: row.authority, estTraffic: row.estTraffic, overlapPct: row.overlapPct, trend: row.trend }));
    case "recommendations":
      return listSection(d.recommendations, (row) => ({ title: row.title, module: row.module, priorityScore: row.priorityScore, estImpact: row.estImpact, confidence: row.confidence, effort: row.effort, evidence: row.evidence, relatedMetric: row.relatedMetric }));
  }
}

export const getSiteLive = defineTool({
  name: "get_site_live",
  title: "Get a site's live datasets",
  description: "Latest stored live datasets for one site: striking-distance queries, GSC query-page rows, page and query movers, ranked keywords, keyword gaps, competitors and recommendations, plus GSC 28-day totals. Each section carries capturedOn/collectedAt for freshness and is paged with limit/offset. Free; reads stored snapshots only.",
  kind: "read",
  input: z.object({
    site: siteArg,
    sections: z.array(z.enum(LIVE_SECTIONS)).min(1).optional().describe("Sections to return (default: all)."),
    limit: limitArg(25, 500),
    offset: offsetArg,
  }),
  annotations: READ,
  async run({ site, sections, limit, offset }) {
    const bundle = await callRouteOrThrow<DomainLiveBundle, { domainId: string }>(getLiveDomain, { path: `/api/live/${encodeURIComponent(site)}`, params: { domainId: site } });
    const wanted = sections?.length ? [...new Set(sections)] : [...LIVE_SECTIONS];
    return {
      site,
      data: {
        site,
        lastSync: bundle.lastSync,
        gscTotals: bundle.datasets.gsc_totals ? { ...bundle.datasets.gsc_totals.data, freshness: freshness(bundle.datasets.gsc_totals) } : null,
        sections: Object.fromEntries(wanted.map((section) => [section, liveSection(bundle, section, limit, offset)])),
      },
    };
  },
});

/* --------------------------- get_keyword_strategy ------------------------- */

interface StrategySnapshot {
  capturedOn?: string;
  createdAt?: string | Date;
  clusters?: Array<Record<string, unknown>>;
  pageMap?: Array<Record<string, unknown>>;
  cannibalisation?: Array<Record<string, unknown>>;
  summary?: Record<string, number>;
}

export const getKeywordStrategy = defineTool({
  name: "get_keyword_strategy",
  title: "Get keyword strategy",
  description: "Latest keyword strategy for one site: intent clusters ranked by opportunity score, the GSC page map and cannibalisation issues, with the snapshot date. Free.",
  kind: "read",
  input: z.object({ site: siteArg, limit: limitArg(25, 500), offset: offsetArg }),
  annotations: READ,
  async run({ site, limit, offset }) {
    const body = await callRouteOrThrow<{ strategy: StrategySnapshot | null }>(getKeywordStrategyRoute, { path: "/api/keyword-strategy", query: { site } });
    const strategy = body.strategy;
    if (!strategy) return { site, data: { site, status: "awaiting_first_sync", strategy: null } };
    const clusters = [...(strategy.clusters ?? [])].sort((a, b) => Number(b.opportunityScore ?? 0) - Number(a.opportunityScore ?? 0));
    return {
      site,
      data: {
        site,
        capturedOn: strategy.capturedOn ?? null,
        createdAt: iso(strategy.createdAt),
        summary: strategy.summary ?? {},
        clusters: page(clusters, limit, offset),
        pageMap: page(strategy.pageMap, limit, offset),
        cannibalisation: page(strategy.cannibalisation, limit, offset),
      },
    };
  },
});

/* ------------------------- get_market_intelligence ------------------------ */

/** Truncate every nested array to `limit` items so a large read model stays
 * compact; top-level list totals are reported separately. */
function capDeep(value: unknown, limit: number, depth = 0): unknown {
  if (Array.isArray(value)) return value.slice(0, limit).map((item) => capDeep(item, limit, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date) && depth < 6) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, capDeep(item, limit, depth + 1)]));
  }
  return value;
}

function arrayTotals(value: Record<string, unknown>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) totals[key] = item.length;
    else if (item && typeof item === "object") {
      for (const [inner, nested] of Object.entries(item)) if (Array.isArray(nested)) totals[`${key}.${inner}`] = nested.length;
    }
  }
  return totals;
}

export const getMarketIntelligence = defineTool({
  name: "get_market_intelligence",
  title: "Get market intelligence",
  description: "Market intelligence for one site over 7, 28, 90 or 365 days: share of voice from tracked rankings, competitor content, link research, market coverage, the opportunity queue, forecasts, dataset freshness and collection health. Nested lists are capped at `limit`; `totals` gives full list sizes. Use get_ai_visibility for AI detail. Free.",
  kind: "read",
  input: z.object({
    site: siteArg,
    days: z.literal([7, 28, 90, 365]).default(90).describe("Window in days: 7, 28, 90 (default) or 365."),
    limit: limitArg(10, 100),
  }),
  annotations: READ,
  async run({ site, days, limit }) {
    const body = await callRouteOrThrow<Record<string, unknown>>(getMarketIntelligenceRoute, { path: "/api/market-intelligence", query: { site, days } });
    const ai = (body.ai ?? {}) as { summary?: unknown };
    const sections: Record<string, unknown> = {
      shareOfVoice: body.shareOfVoice,
      content: body.content,
      links: body.links,
      coverage: body.coverage,
      opportunities: body.opportunities,
      forecasts: body.forecasts,
    };
    return {
      site,
      data: {
        site,
        days,
        provenance: body.provenance ?? null,
        datasets: body.datasets ?? null,
        collection: body.collection ?? null,
        aiSummary: ai.summary ?? null,
        totals: arrayTotals(sections),
        ...(capDeep(sections, limit) as Record<string, unknown>),
        ...(body.synthetic ? { synthetic: true } : {}),
      },
    };
  },
});

/* ----------------------------- get_ai_visibility -------------------------- */

interface AiObservationRow {
  prompt: string;
  topic: string;
  platform: string;
  modelName?: string;
  capturedOn: string;
  capturedAt?: string | Date;
  mentioned: boolean;
  cited: boolean;
  recommendationPosition: number | null;
  sentiment: string;
  citations?: Array<{ url: string; domain: string; owned: boolean }>;
  entities?: Array<{ name: string; host: string | null; owned: boolean }>;
}

interface AiDashboardBody {
  scope?: { days?: number };
  summary?: Record<string, unknown>;
  platforms?: Array<Record<string, unknown>>;
  observations?: AiObservationRow[];
  sources?: Array<{ domain: string; citations: number; owned: boolean; platforms?: string[]; prompts?: string[]; urls?: string[] }>;
  competitors?: Array<{ name: string; host: string | null; mentions: number; owned?: boolean; shareOfVoice?: number; avgPosition?: number | null }>;
  trackedPrompts?: unknown[];
  recommendations?: unknown[];
  synthetic?: boolean;
}

const AI_PLATFORMS = ["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"] as const;

export const getAiVisibility = defineTool({
  name: "get_ai_visibility",
  title: "Get AI visibility",
  description: "AI answer-engine visibility for one site: the latest measured result per tracked prompt and platform (mentioned, cited, position, sentiment, owned citation URLs, cited domains, competitors mentioned), platform summaries, top competitor brands and the non-owned domains AI engines cite. Free; reads stored observations.",
  kind: "read",
  input: z.object({
    site: siteArg,
    days: z.number().int().min(7).max(365).default(90).describe("Look-back window in days (7 to 365, default 90)."),
    platform: z.enum(AI_PLATFORMS).optional().describe("Only this platform."),
    limit: limitArg(50, 300),
    offset: offsetArg,
  }),
  annotations: READ,
  async run({ site, days, platform, limit, offset }) {
    const body = await callRouteOrThrow<AiDashboardBody>(getAiVisibilityRoute, { path: "/api/ai-visibility", query: { scope: site, days, platform } });
    const observations = body.observations ?? [];
    const results = observations.map((row) => {
      const citations = row.citations ?? [];
      const entities = row.entities ?? [];
      return {
        prompt: row.prompt,
        topic: row.topic,
        platform: row.platform,
        model: row.modelName ?? null,
        capturedOn: row.capturedOn,
        capturedAt: iso(row.capturedAt),
        mentioned: row.mentioned,
        cited: row.cited,
        position: row.recommendationPosition,
        sentiment: row.sentiment,
        ownedCitations: citations.filter((item) => item.owned).map((item) => item.url).slice(0, 10),
        citedDomains: [...new Set(citations.filter((item) => !item.owned).map((item) => item.domain))].slice(0, 10),
        competitorsMentioned: [...new Set(entities.filter((item) => !item.owned).map((item) => item.host ?? item.name))].slice(0, 10),
      };
    });
    const latestCapturedAt = results.map((row) => row.capturedAt ?? row.capturedOn).sort().at(-1) ?? null;
    return {
      site,
      data: {
        site,
        days: body.scope?.days ?? days,
        platform: platform ?? null,
        latestCapturedAt,
        summary: body.summary ?? null,
        platforms: body.platforms ?? [],
        trackedPrompts: body.trackedPrompts?.length ?? 0,
        results: page(results, limit, offset),
        competitorDomains: (body.competitors ?? []).filter((item) => !item.owned).slice(0, limit).map((item) => ({ name: item.name, host: item.host, mentions: item.mentions, shareOfVoice: item.shareOfVoice ?? null, avgPosition: item.avgPosition ?? null })),
        citedSources: (body.sources ?? []).filter((item) => !item.owned).slice(0, limit).map((item) => ({ domain: item.domain, citations: item.citations, platforms: item.platforms ?? [], samplePrompts: (item.prompts ?? []).slice(0, 3), sampleUrls: (item.urls ?? []).slice(0, 3) })),
        recommendations: (body.recommendations ?? []).slice(0, 10),
        ...(body.synthetic ? { synthetic: true } : {}),
      },
    };
  },
});

/* ---------------------------- get_rank_tracking --------------------------- */

interface RankKeywordRow {
  id: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  cadence?: string;
  active?: boolean;
  targetUrl: string | null;
  tags?: string[];
  campaignId: string | null;
}

interface RankHistoryRow {
  trackedKeywordId: string;
  capturedOn: string;
  position: number | null;
  url: string | null;
  competitors?: Array<{ host: string; position: number; url: string | null }>;
}

interface RankReportBody {
  campaigns?: Array<{ id: string; name: string; competitors?: string[]; defaultCadence?: string; alertThreshold?: number; updatedAt?: string | Date }>;
  keywords?: RankKeywordRow[];
  history?: RankHistoryRow[];
  volumes?: Record<string, number>;
  volumeCollectedAt?: string | null;
  truncated?: boolean;
  from: string;
  to: string;
  synthetic?: boolean;
}

export const getRankTracking = defineTool({
  name: "get_rank_tracking",
  title: "Get rank tracking",
  description: "Tracked keyword rankings for one site: campaigns, and per keyword the latest exact SERP position, previous position, change, best position in the window, ranking URL and top competitors, sorted by position. Free; reads stored daily rank history.",
  kind: "read",
  input: z.object({
    site: siteArg,
    days: z.number().int().min(1).max(365).default(30).describe("History window in days (default 30)."),
    limit: limitArg(100, 1000),
    offset: offsetArg,
  }),
  annotations: READ,
  async run({ site, days, limit, offset }) {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    const from = fromDate.toISOString().slice(0, 10);
    const body = await callRouteOrThrow<RankReportBody>(getRankReportRoute, { path: "/api/rank-tracking/report", query: { site, from, to } });
    const byKeyword = new Map<string, RankHistoryRow[]>();
    for (const row of [...(body.history ?? [])].sort((a, b) => b.capturedOn.localeCompare(a.capturedOn))) {
      byKeyword.set(row.trackedKeywordId, [...(byKeyword.get(row.trackedKeywordId) ?? []), row]);
    }
    const keywords = (body.keywords ?? []).map((keyword) => {
      const history = byKeyword.get(keyword.id) ?? [];
      const latest = history[0] ?? null;
      const previous = history[1] ?? null;
      const positions = history.map((row) => row.position).filter((value): value is number => value != null);
      return {
        id: keyword.id,
        keyword: keyword.keyword,
        device: keyword.device,
        locationCode: keyword.locationCode,
        languageCode: keyword.languageCode,
        cadence: keyword.cadence ?? null,
        active: keyword.active ?? true,
        campaignId: keyword.campaignId,
        targetUrl: keyword.targetUrl,
        tags: keyword.tags ?? [],
        volume: body.volumes?.[volumeKey(keyword)] ?? null,
        latest: latest ? { capturedOn: latest.capturedOn, position: latest.position, url: latest.url } : null,
        previousPosition: previous?.position ?? null,
        change: latest?.position != null && previous?.position != null ? previous.position - latest.position : null,
        bestPosition: positions.length ? Math.min(...positions) : null,
        topCompetitors: (latest?.competitors ?? []).slice(0, 3),
      };
    }).sort((a, b) => (a.latest?.position ?? 1000) - (b.latest?.position ?? 1000) || a.keyword.localeCompare(b.keyword));
    const ranked = keywords.filter((row) => row.latest?.position != null);
    return {
      site,
      data: {
        site,
        from: body.from,
        to: body.to,
        latestCapturedOn: (body.history ?? []).map((row) => row.capturedOn).sort().at(-1) ?? null,
        volumeCollectedAt: body.volumeCollectedAt ?? null,
        totals: {
          keywords: keywords.length,
          active: keywords.filter((row) => row.active).length,
          ranked: ranked.length,
          top3: ranked.filter((row) => row.latest!.position! <= 3).length,
          top10: ranked.filter((row) => row.latest!.position! <= 10).length,
          notRanked: keywords.length - ranked.length,
        },
        campaigns: (body.campaigns ?? []).map((item) => ({ id: item.id, name: item.name, competitors: item.competitors ?? [], defaultCadence: item.defaultCadence ?? null, alertThreshold: item.alertThreshold ?? null, updatedAt: iso(item.updatedAt) })),
        keywords: page(keywords, limit, offset),
        ...(body.truncated ? { truncated: true } : {}),
        ...(body.synthetic ? { synthetic: true } : {}),
      },
    };
  },
});

/* -------------------------- get_collection_health ------------------------- */

function compactHealthItem(item: CollectionHealthItem) {
  return {
    label: item.label,
    state: item.state,
    confidence: item.confidence,
    cadence: item.cadence,
    records: item.records,
    distinctDates: item.distinctDates,
    observedAt: item.observedAt,
    nextRunAt: item.nextRunAt,
    staleAfterDays: item.staleAfterDays,
    validationIssues: item.validationIssues,
  };
}

export const getCollectionHealth = defineTool({
  name: "get_collection_health",
  title: "Get collection health",
  description: "Collection health per dataset (rankings, competitors, coverage, links, AI, outcomes): state (ready, warming, stale, empty, failed, not_configured), last observation, next scheduled run and validation issues. Pass `site` for one site, or omit it for the portfolio (paged by limit/offset). Free.",
  kind: "read",
  input: z.object({
    site: siteArg.optional(),
    limit: limitArg(20, 100),
    offset: offsetArg,
  }),
  annotations: READ,
  async run({ site, limit, offset }) {
    if (!hasDatabase()) throw new McpToolError("Collection health requires DATABASE_URL.");
    if (site) {
      await requireSite(site);
      const health = await loadCollectionHealth(site);
      return { site, data: { site, generatedAt: health.generatedAt, items: Object.fromEntries(Object.entries(health.items).map(([key, item]) => [key, compactHealthItem(item)])) } };
    }
    const sites = await listManagedSites();
    const slice = page(sites, limit, offset);
    const rows = [];
    for (const item of slice.rows) {
      try {
        const health = await loadCollectionHealth(item.id);
        rows.push({ site: item.id, name: item.name, items: Object.fromEntries(Object.entries(health.items).map(([key, value]) => [key, { state: value.state, observedAt: value.observedAt, nextRunAt: value.nextRunAt, issues: value.validationIssues.length }])) });
      } catch (error) {
        rows.push({ site: item.id, name: item.name, error: error instanceof Error ? error.message : "Collection health unavailable." });
      }
    }
    return { data: { generatedAt: new Date().toISOString(), sites: { ...slice, rows } } };
  },
});

/* --------------------------------- get_spend ------------------------------ */

export const getSpend = defineTool({
  name: "get_spend",
  title: "Get DataForSEO spend",
  description: "Month-to-date DataForSEO spend against the overall $200 monthly guardrail, the claude-mcp connector's own spend against its monthly cap, and spend by actor. Free.",
  kind: "read",
  input: z.object({}),
  annotations: READ,
  async run() {
    const [overall, mcp, byActor] = await Promise.all([overallBudgetStatus(), mcpBudgetStatus(), spendByActor()]);
    return {
      data: {
        month: mcp.month,
        overall: {
          spentUsd: round(overall.spentUsd, 4),
          reservedUsd: round(overall.reservedUsd ?? 0, 4),
          limitUsd: overall.limitUsd,
          remainingUsd: round(overall.remainingUsd, 4),
          pctUsed: overall.pctUsed,
          crossedThresholds: overall.crossed,
        },
        mcp,
        byActor,
        durable: hasDatabase(),
        generatedAt: new Date().toISOString(),
      },
    };
  },
});

export const READ_TOOLS = [listSites, getSiteLive, getKeywordStrategy, getMarketIntelligence, getAiVisibility, getRankTracking, getCollectionHealth, getSpend];
