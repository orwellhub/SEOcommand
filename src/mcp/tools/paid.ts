import { and, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { GET as keywordResearchRoute, POST as keywordMetricsRoute } from "@/app/api/keyword-research/route";
import { POST as keywordGapRoute } from "@/app/api/keyword-gap/route";
import { POST as refreshRoute } from "@/app/api/refresh/route";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { db, schema } from "@/db";
import { matchesGap, type GapKeyword, type GapKind } from "@/lib/domain-comparison";
import type { KeywordResearchResult, KeywordResearchRow } from "@/lib/types";
import { estimateScanCost, tiersForModules } from "@/platform/scan-policy";
import { ensureRegistryAiTrackingPrompts, listAiTrackingPrompts, paidJobsApproved } from "@/platform/site-store";
import type { ManagedSite } from "@/platform/types";
import { dataForSeoConfigured } from "@/providers/dataforseo";
import { requestCostEstimate } from "@/providers/dataforseo/config";
import { syncDomain, type DomainSyncReport } from "@/sync/engine";
import { hasDatabase } from "@/sync/store";
import { runAsMcpActor, runPaid, type PaidRun } from "../budget";
import { callRouteOrThrow, McpToolError } from "../internal";
import { defineTool, limitArg, offsetArg, page, requireSite, siteArg, type ToolOutput } from "./shared";

/**
 * Paid tools. Each one estimates its DataForSEO cost from the provider's own
 * pre-flight estimates (requestCostEstimate / estimateScanCost), is refused
 * before spending if that estimate does not fit the claude-mcp budget or the
 * overall guardrail, and then runs the existing route or sync engine as actor
 * "claude-mcp" so SpendGuard enforces the caps on every provider request.
 */

const PAID = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

function spendSummary(run: Pick<PaidRun<unknown>, "estimateUsd" | "costUsd" | "requests" | "budget">) {
  return { estimateUsd: run.estimateUsd, costUsd: run.costUsd, providerRequests: run.requests, budget: run.budget };
}

function paidOutput(site: string | null, run: PaidRun<unknown>, data: Record<string, unknown>): ToolOutput {
  return { site, costUsd: run.costUsd, estimateUsd: run.estimateUsd, data: { ...data, spend: spendSummary(run) } };
}

function requireProvider() {
  if (process.env.QA_SYNTHETIC !== "true" && !dataForSeoConfigured()) {
    throw new McpToolError("DataForSEO credentials are not configured on SEO Command, so paid tools are unavailable.");
  }
}

function requirePaidApproval(site: ManagedSite) {
  if (!paidJobsApproved(site)) {
    throw new McpToolError(`${site.id} is not approved for paid collection (spend approval "${site.spendApproval}", status "${site.lifecycleStatus}"). Approve its spending limit in SEO Command first.`);
  }
}

function keywordRow(row: KeywordResearchRow) {
  return {
    keyword: row.keyword,
    volume: row.volume,
    difficulty: row.difficulty,
    cpc: row.cpc,
    competition: row.competition,
    intent: row.intent,
    serpFeatures: row.serpFeatures ?? [],
    trend: row.trend?.slice(-12) ?? [],
  };
}

/* ----------------------------- keyword_research --------------------------- */

const FilterSchema = z.object({
  match: z.enum(["all", "broad", "phrase", "exact", "related"]),
  questions: z.boolean(),
  include: z.string().max(300).describe("Comma-separated words that must appear."),
  exclude: z.string().max(300).describe("Comma-separated words to exclude."),
  intent: z.enum(["informational", "navigational", "commercial", "transactional"]),
  minVolume: z.number().min(0),
  maxVolume: z.number().min(0),
  minDifficulty: z.number().min(0).max(100),
  maxDifficulty: z.number().min(0).max(100),
  sort: z.enum(["volume", "keyword", "difficulty", "cpc", "competition", "intent"]),
  direction: z.enum(["asc", "desc"]),
}).partial();

const SOURCE_TYPES = ["seed", "domain", "competitor", "questions", "related"] as const;

export function keywordResearchEstimate(args: { sourceType: (typeof SOURCE_TYPES)[number]; limit: number; offset: number; overview: boolean; seed: string; match?: string }): number {
  const domainSource = args.sourceType === "domain" || args.sourceType === "competitor";
  const endpoint = domainSource ? "labsRankedKeywords" : args.sourceType === "related" || args.match === "related" ? "labsRelatedKeywords" : "labsKeywordSuggestions";
  let estimate = requestCostEstimate(endpoint, [{ limit: args.limit }]);
  if (args.overview && args.offset === 0 && !domainSource) {
    estimate += requestCostEstimate("labsKeywordOverview", [{ keywords: [args.seed] }])
      + requestCostEstimate("labsKeywordSuggestions", [{ limit: 5 }])
      + requestCostEstimate("labsRelatedKeywords", [{ limit: 5 }]);
  }
  return estimate;
}

export const keywordResearch = defineTool({
  name: "keyword_research",
  title: "Keyword research (paid)",
  description: "PAID (DataForSEO). Discover keywords for a seed term, or the keywords a domain ranks for, in one country database: volume, difficulty, CPC, intent and SERP features, paged with limit/offset. Defaults to the site's market when `site` is given. Refused before spending if the estimate would pass the claude-mcp budget.",
  kind: "paid",
  input: z.object({
    seed: z.string().trim().min(1).max(200).describe("Keyword (up to 80 characters), or a domain when sourceType is domain or competitor."),
    site: siteArg.optional().describe("Site to attribute spend to; its market is the default database."),
    sourceType: z.enum(SOURCE_TYPES).default("seed").describe("seed (default), domain, competitor, questions or related."),
    locationCode: z.number().int().positive().optional().describe("DataForSEO country location code, e.g. 2826 (UK), 2784 (UAE), 2840 (US)."),
    languageCode: z.string().regex(/^[A-Za-z-]{2,10}$/).optional(),
    limit: z.number().int().min(1).max(1000).default(50),
    offset: z.number().int().min(0).max(20_000).default(0),
    overview: z.boolean().default(false).describe("Also collect exact seed metrics, top questions and related keywords (extra paid calls)."),
    filters: FilterSchema.optional().describe("Provider-side filters and sort."),
  }),
  annotations: PAID,
  async run(args) {
    const site = args.site ? await requireSite(args.site) : null;
    requireProvider();
    const locationCode = args.locationCode ?? site?.dataForSeoLocationCode ?? undefined;
    const languageCode = args.languageCode ?? (args.locationCode ? undefined : site?.dataForSeoLanguageCode) ?? undefined;
    const filters = args.filters
      ? Object.fromEntries(Object.entries(args.filters).map(([key, value]) => [key, typeof value === "number" ? String(value) : value]))
      : undefined;
    const estimate = keywordResearchEstimate({ ...args, match: args.filters?.match });
    const run = await runPaid(estimate, () => callRouteOrThrow<{ result: KeywordResearchResult; warnings?: string[]; synthetic?: boolean }>(keywordResearchRoute, {
      path: "/api/keyword-research",
      query: {
        seed: args.seed,
        site: site?.id,
        sourceType: args.sourceType,
        location: locationCode,
        language: languageCode,
        limit: args.limit,
        offset: args.offset,
        report: args.overview ? "overview" : undefined,
        filters: filters ? JSON.stringify(filters) : undefined,
      },
    }));
    const result = run.result.result;
    return paidOutput(site?.id ?? null, run, {
      seed: result.seed,
      locationCode: result.locationCode,
      locationLabel: result.locationLabel,
      languageCode: result.languageCode,
      fetchedAt: result.fetchedAt,
      total: result.pagination?.total ?? null,
      nextOffset: result.pagination?.hasMore ? result.pagination.nextOffset : null,
      primary: result.report?.primary ? keywordRow(result.report.primary) : null,
      questions: result.report?.questions ? { total: result.report.questions.total, rows: result.report.questions.rows.map(keywordRow) } : undefined,
      related: result.report?.related ? { total: result.report.related.total, rows: result.report.related.rows.map(keywordRow) } : undefined,
      rows: result.rows.map(keywordRow),
      warnings: run.result.warnings ?? result.report?.warnings ?? [],
      ...(run.result.synthetic ? { synthetic: true } : {}),
    });
  },
});

/* ------------------------------ keyword_metrics --------------------------- */

export const keywordMetrics = defineTool({
  name: "keyword_metrics",
  title: "Keyword metrics (paid)",
  description: "PAID (DataForSEO). Exact volume, difficulty, CPC, competition and intent for up to 700 known keywords in one country database. Defaults to the site's market when `site` is given. Refused before spending if the estimate would pass the claude-mcp budget.",
  kind: "paid",
  input: z.object({
    keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(700),
    site: siteArg.optional(),
    locationCode: z.number().int().positive().optional(),
    languageCode: z.string().regex(/^[A-Za-z-]{2,10}$/).optional(),
  }),
  annotations: PAID,
  async run(args) {
    const site = args.site ? await requireSite(args.site) : null;
    requireProvider();
    const location = args.locationCode ?? site?.dataForSeoLocationCode;
    const language = args.languageCode ?? site?.dataForSeoLanguageCode;
    if (!location || !language) throw new McpToolError("Pass locationCode and languageCode, or a site whose market supplies them.");
    const keywords = [...new Set(args.keywords.map((word) => word.toLowerCase()))];
    const estimate = requestCostEstimate("labsKeywordOverview", [{ keywords }]);
    const run = await runPaid(estimate, () => callRouteOrThrow<{ rows: KeywordResearchRow[]; fetchedAt?: string; synthetic?: boolean }>(keywordMetricsRoute, {
      path: "/api/keyword-research",
      method: "POST",
      body: { action: "metrics", site: site?.id ?? null, keywords, location, language },
    }));
    return paidOutput(site?.id ?? null, run, {
      locationCode: location,
      languageCode: language,
      fetchedAt: run.result.fetchedAt ?? new Date().toISOString(),
      rows: (run.result.rows ?? []).map(keywordRow),
      ...(run.result.synthetic ? { synthetic: true } : {}),
    });
  },
});

/* -------------------------------- keyword_gap ----------------------------- */

const GAP_KINDS = ["all", "missing", "untapped", "weak", "strong", "shared", "unique"] as const;

interface GapRecord {
  id: string;
  status: string;
  payload: { input?: { domains?: string[]; locationCode?: number; languageCode?: string }; rows?: GapKeyword[]; completed?: string[]; totals?: Record<string, number | null>; costUsd?: number; collectedAt?: string; error?: string };
}

export const keywordGap = defineTool({
  name: "keyword_gap",
  title: "Keyword gap (paid)",
  description: "PAID (DataForSEO). Compare a site's organic keywords with 1 to 4 competitor domains in one database. Returns keywords classified as missing (competitors all rank, site does not), untapped (some competitor ranks), weak (a competitor ranks higher), strong, shared or unique, sorted by volume. Saved in SEO Command's keyword-gap workspace. Refused before spending if the estimate would pass the claude-mcp budget.",
  kind: "paid",
  input: z.object({
    site: siteArg,
    competitors: z.array(z.string().trim().min(3).max(253)).min(1).max(4).describe("Competitor domains, e.g. [\"rival.com\"]."),
    locationCode: z.number().int().positive().optional().describe("Default: the site's market."),
    languageCode: z.string().min(2).max(12).optional(),
    providerLimit: z.number().int().min(1).max(1000).default(250).describe("Keywords requested per comparison from DataForSEO (drives cost; default 250)."),
    filter: z.enum(GAP_KINDS).default("all"),
    limit: limitArg(100, 1000),
    offset: offsetArg,
  }),
  annotations: PAID,
  async run(args) {
    const site = await requireSite(args.site);
    requireProvider();
    const locationCode = args.locationCode ?? site.dataForSeoLocationCode;
    const languageCode = args.languageCode ?? site.dataForSeoLanguageCode;
    if (!locationCode) throw new McpToolError(`${site.id} has no default DataForSEO location; pass locationCode.`);
    const estimate = args.competitors.length * 3 * requestCostEstimate("labsDomainIntersection", [{ limit: args.providerLimit }]);
    const run = await runPaid(estimate, () => callRouteOrThrow<{ record: GapRecord }>(keywordGapRoute, {
      path: "/api/keyword-gap",
      method: "POST",
      body: { site: site.id, domains: [site.host, ...args.competitors], locationCode, languageCode, limit: args.providerLimit },
    }));
    const record = run.result.record;
    const domains = record.payload.input?.domains ?? [site.host, ...args.competitors];
    const own = domains[0]!;
    const rows = [...(record.payload.rows ?? [])].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
    const counts = Object.fromEntries(GAP_KINDS.filter((kind) => kind !== "all").map((kind) => [kind, rows.filter((row) => matchesGap(row, domains, kind as GapKind)).length]));
    const selected = rows.filter((row) => matchesGap(row, domains, args.filter as GapKind)).map((row) => ({
      keyword: row.keyword,
      volume: row.volume,
      difficulty: row.difficulty,
      intent: row.intent,
      sitePosition: row.positions[own]?.position ?? null,
      siteUrl: row.positions[own]?.url ?? null,
      competitors: Object.fromEntries(domains.slice(1).map((domain) => [domain, row.positions[domain]?.known ? row.positions[domain]!.position : "unknown"])),
    }));
    return paidOutput(site.id, run, {
      site: site.id,
      recordId: record.id,
      status: record.status,
      domains,
      locationCode,
      languageCode,
      collectedAt: record.payload.collectedAt ?? null,
      counts: { all: rows.length, ...counts },
      filter: args.filter,
      keywords: page(selected, args.limit, args.offset),
    });
  },
});

/* --------------------------- run_ai_visibility_now ------------------------ */

const AI_LLM_PLATFORMS = new Set(["chatgpt", "claude", "gemini", "perplexity"]);

export function aiPromptRunEstimate(prompts: Array<{ platforms: string[]; sampleCount: number }>): number {
  const unit = (platform: string) => {
    if (AI_LLM_PLATFORMS.has(platform)) return requestCostEstimate("aiLlmResponses", [{}]);
    if (platform === "google_ai_mode") return requestCostEstimate("googleAiModeLive", [{ depth: 20 }]);
    if (platform === "google_ai_overview") return requestCostEstimate("serpOrganicLive", [{ depth: 20 }]);
    return 0; // copilot runs through an external adapter, not DataForSEO
  };
  return prompts.reduce((sum, prompt) => sum + prompt.platforms.reduce((inner, platform) => inner + unit(platform) * Math.max(1, prompt.sampleCount), 0), 0);
}

function datasetResults(report: DomainSyncReport | undefined) {
  return (report?.results ?? []).filter((item) => item.status !== "skipped" || item.note).map((item) => ({ dataset: item.dataset, status: item.status, ...(item.note ? { note: item.note } : {}) }));
}

export const runAiVisibilityNow = defineTool({
  name: "run_ai_visibility_now",
  title: "Run AI visibility checks now (paid)",
  description: "PAID (DataForSEO). Run a site's tracked AI prompts now (all active prompts, or the given promptIds) through the sync engine's AI collector, storing observations exactly as the scheduler does. Prompts that are already due also run. Read the results with get_ai_visibility. Refused before spending if the estimate would pass the claude-mcp budget.",
  kind: "paid",
  input: z.object({
    site: siteArg,
    promptIds: z.array(z.string().uuid()).min(1).max(100).optional().describe("Only these prompts (from list_ai_prompts). Default: every active prompt."),
  }),
  annotations: PAID,
  async run({ site: slug, promptIds }) {
    if (!hasDatabase()) throw new McpToolError("AI visibility runs require DATABASE_URL.");
    const site = await requireSite(slug);
    requireProvider();
    requirePaidApproval(site);
    let prompts = await listAiTrackingPrompts(site.id);
    if (!prompts.length && TRACKED_AI_PROMPTS[site.id]?.length) prompts = await ensureRegistryAiTrackingPrompts(site.id, TRACKED_AI_PROMPTS[site.id]!);
    const now = new Date();
    const selected = promptIds ? prompts.filter((item) => promptIds.includes(item.id)) : prompts;
    if (promptIds) {
      const missing = promptIds.filter((id) => !prompts.some((item) => item.id === id));
      if (missing.length) throw new McpToolError(`These prompt ids are not active for ${site.id}: ${missing.join(", ")}.`);
    }
    if (!selected.length) throw new McpToolError(`${site.id} has no active tracked AI prompts. Add one with upsert_ai_prompt.`);
    const alreadyDue = prompts.filter((item) => !selected.includes(item) && item.nextRunAt <= now);
    const toRun = [...selected, ...alreadyDue];
    const estimate = aiPromptRunEstimate(toRun);

    const run = await runPaid(estimate, async () => {
      // Make the selected prompts due now. Any that do not run (for example a
      // budget stop part-way) get their original schedule back afterwards.
      const original = new Map(selected.map((item) => [item.id, { nextRunAt: item.nextRunAt, lastRunAt: item.lastRunAt }]));
      const ids = selected.map((item) => item.id);
      await db().update(schema.aiTrackingPrompts).set({ nextRunAt: now }).where(and(inArray(schema.aiTrackingPrompts.id, ids), eq(schema.aiTrackingPrompts.siteSlug, site.id)));
      try {
        return await syncDomain(site.id, tiersForModules(["ai"]));
      } finally {
        const after = await db().select({ id: schema.aiTrackingPrompts.id, lastRunAt: schema.aiTrackingPrompts.lastRunAt }).from(schema.aiTrackingPrompts)
          .where(and(inArray(schema.aiTrackingPrompts.id, ids), lte(schema.aiTrackingPrompts.nextRunAt, now)));
        for (const row of after) {
          const before = original.get(row.id);
          if (before && row.lastRunAt?.getTime() === before.lastRunAt?.getTime()) {
            await db().update(schema.aiTrackingPrompts).set({ nextRunAt: before.nextRunAt }).where(eq(schema.aiTrackingPrompts.id, row.id));
          }
        }
      }
    });
    const ai = run.result.results.find((item) => item.dataset === "ai_prompts");
    return paidOutput(site.id, run, {
      site: site.id,
      prompts: toRun.map((item) => ({ id: item.id, prompt: item.prompt, platforms: item.platforms, sampleCount: item.sampleCount, reason: selected.includes(item) ? "requested" : "already_due" })),
      aiPrompts: ai ? { status: ai.status, ...(ai.note ? { note: ai.note } : {}) } : null,
      results: datasetResults(run.result),
      startedAt: run.result.startedAt,
      completedAt: run.result.completedAt,
      next: "Call get_ai_visibility for the measured results.",
    });
  },
});

/* -------------------------------- refresh_site ---------------------------- */

const DATAFORSEO_REFRESH_MODULES = ["rankings", "keywords", "competitors", "backlinks"] as const;

interface RefreshBody {
  ok: boolean;
  source: string;
  scope: string;
  elapsedMs: number;
  report: { domains: DomainSyncReport[] };
}

export const refreshSite = defineTool({
  name: "refresh_site",
  title: "Refresh a site's data",
  description: "Refresh one site through SEO Command's refresh route. source=google pulls Search Console and GA4 (free). source=dataforseo is PAID: tracked rankings, ranked keywords, competitors, keyword gaps and backlinks (no crawl or AI checks); refused before spending if the estimate would pass the claude-mcp budget. Returns per-dataset status.",
  kind: "paid",
  input: z.object({
    site: siteArg,
    source: z.enum(["google", "dataforseo"]).describe("google (free) or dataforseo (paid)."),
  }),
  annotations: PAID,
  async run({ site: slug, source }) {
    const site = await requireSite(slug);
    const call = () => callRouteOrThrow<RefreshBody>(refreshRoute, { path: "/api/refresh", method: "POST", body: { source, domainId: site.id } });
    if (source === "google") {
      const run = await runAsMcpActor(call);
      const report = run.result.report?.domains?.[0];
      return {
        site: site.id,
        costUsd: run.costUsd,
        data: { site: site.id, source, elapsedMs: run.result.elapsedMs, results: datasetResults(report), startedAt: report?.startedAt ?? null, completedAt: report?.completedAt ?? null, spend: { costUsd: run.costUsd } },
      };
    }
    requireProvider();
    requirePaidApproval(site);
    const estimate = estimateScanCost([...DATAFORSEO_REFRESH_MODULES]).estimatedUsd;
    const run = await runPaid(estimate, call);
    const report = run.result.report?.domains?.[0];
    return paidOutput(site.id, run, {
      site: site.id,
      source,
      elapsedMs: run.result.elapsedMs,
      results: datasetResults(report),
      startedAt: report?.startedAt ?? null,
      completedAt: report?.completedAt ?? null,
      estimateNote: "The estimate uses SEO Command's scan-module estimates; the cap is enforced on each provider request, so a larger run stops at the cap and keeps what completed.",
    });
  },
});

export const PAID_TOOLS = [keywordResearch, keywordMetrics, keywordGap, runAiVisibilityNow, refreshSite];
