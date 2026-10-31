import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { GET as listAiPromptsRoute } from "@/app/api/ai-prompts/route";
import { GET as listRankTrackingRoute } from "@/app/api/rank-tracking/route";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { MCP_ACTOR } from "../config";
import { callRouteOrThrow, McpToolError } from "../internal";
import { defineTool, iso, limitArg, offsetArg, page, requireSite, siteArg } from "./shared";

/**
 * Manage tools change what SEO Command tracks. They spend nothing themselves,
 * but tracked prompts and keywords are collected by the scheduler, whose spend
 * counts against the site's approved ceiling and the overall guardrail.
 * Deletes never destroy measured history: an item that already has
 * observations is deactivated instead.
 */

export const AI_PROMPT_PLATFORMS = ["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"] as const;
const SCHEDULED_SPEND_NOTE = "Tracked items are collected by the scheduler; that spend counts against the site's approved ceiling and the overall monthly guardrail, not the claude-mcp budget.";

function requireDatabase() {
  if (!hasDatabase()) throw new McpToolError("This tool requires DATABASE_URL.");
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

/* -------------------------------- AI prompts ------------------------------ */

type PromptRow = typeof schema.aiTrackingPrompts.$inferSelect;

function promptView(row: PromptRow | Record<string, unknown>) {
  const item = row as PromptRow;
  return {
    id: item.id,
    prompt: item.prompt,
    topic: item.topic,
    platforms: item.platforms,
    sampleCount: item.sampleCount,
    cadence: item.cadence,
    priority: item.priority,
    locationCode: item.locationCode ?? null,
    languageCode: item.languageCode,
    active: item.active,
    source: item.source,
    nextRunAt: iso(item.nextRunAt),
    lastRunAt: iso(item.lastRunAt),
    updatedAt: iso(item.updatedAt),
  };
}

const MANAGE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const listAiPrompts = defineTool({
  name: "list_ai_prompts",
  title: "List tracked AI prompts",
  description: "List the AI-visibility prompts tracked for one site with platforms, sample count, cadence, market and next/last run times. Free.",
  kind: "manage",
  input: z.object({
    site: siteArg,
    includeInactive: z.boolean().default(true).describe("Include deactivated prompts (default true)."),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run({ site, includeInactive }) {
    await requireSite(site);
    const body = await callRouteOrThrow<{ prompts: PromptRow[] }>(listAiPromptsRoute, { path: "/api/ai-prompts", query: { scope: site } });
    const prompts = (body.prompts ?? []).filter((row) => includeInactive || row.active).map(promptView);
    return { site, data: { site, count: prompts.length, prompts } };
  },
});

export const upsertAiPrompt = defineTool({
  name: "upsert_ai_prompt",
  title: "Create or update a tracked AI prompt",
  description: "Create or update one tracked AI-visibility prompt for a site. With `id`, updates that prompt; without it, updates the site's prompt with the same text or creates a new one. Location and language default to the site's market. No spend now; scheduled checks spend against the site ceiling.",
  kind: "manage",
  input: z.object({
    site: siteArg,
    id: z.string().uuid().optional().describe("Prompt id to update (from list_ai_prompts)."),
    prompt: z.string().trim().min(8).max(1000).describe("The question asked of each AI platform."),
    topic: z.string().trim().min(2).max(100),
    platforms: z.array(z.enum(AI_PROMPT_PLATFORMS)).min(1).max(AI_PROMPT_PLATFORMS.length),
    sampleCount: z.number().int().min(1).max(5).optional().describe("Responses sampled per platform per run (default 1)."),
    cadence: z.enum(["daily", "weekly", "monthly"]).optional().describe("Default weekly."),
    priority: z.number().int().min(0).max(100).optional().describe("Default 50."),
    locationCode: z.number().int().positive().nullable().optional().describe("DataForSEO location code (default: the site's market)."),
    languageCode: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional().describe("Language code, e.g. en (default: the site's language)."),
    active: z.boolean().optional(),
  }),
  annotations: MANAGE,
  async run(args) {
    requireDatabase();
    const site = await requireSite(args.site);
    const platforms = [...new Set(args.platforms)];
    const now = new Date();
    const existing = args.id
      ? (await db().select().from(schema.aiTrackingPrompts).where(and(eq(schema.aiTrackingPrompts.id, args.id), eq(schema.aiTrackingPrompts.siteSlug, site.id))).limit(1))[0]
      : (await db().select().from(schema.aiTrackingPrompts).where(and(eq(schema.aiTrackingPrompts.siteSlug, site.id), eq(schema.aiTrackingPrompts.prompt, args.prompt))).limit(1))[0];
    if (args.id && !existing) throw new McpToolError(`Prompt ${args.id} was not found for ${site.id}.`);
    try {
      if (existing) {
        const [row] = await db().update(schema.aiTrackingPrompts).set({
          prompt: args.prompt,
          topic: args.topic,
          platforms,
          ...(args.sampleCount !== undefined ? { sampleCount: args.sampleCount } : {}),
          ...(args.cadence !== undefined ? { cadence: args.cadence } : {}),
          ...(args.priority !== undefined ? { priority: args.priority } : {}),
          ...(args.locationCode !== undefined ? { locationCode: args.locationCode } : {}),
          ...(args.languageCode !== undefined ? { languageCode: args.languageCode.toLowerCase() } : {}),
          ...(args.active !== undefined ? { active: args.active } : {}),
          updatedAt: now,
        }).where(eq(schema.aiTrackingPrompts.id, existing.id)).returning();
        return { site: site.id, data: { site: site.id, created: false, prompt: promptView(row!), note: SCHEDULED_SPEND_NOTE } };
      }
      const [row] = await db().insert(schema.aiTrackingPrompts).values({
        siteSlug: site.id,
        prompt: args.prompt,
        topic: args.topic,
        platforms,
        sampleCount: args.sampleCount ?? 1,
        cadence: args.cadence ?? "weekly",
        priority: args.priority ?? 50,
        locationCode: args.locationCode !== undefined ? args.locationCode : site.dataForSeoLocationCode,
        languageCode: (args.languageCode ?? site.dataForSeoLanguageCode).toLowerCase(),
        source: MCP_ACTOR,
        active: args.active ?? true,
      }).returning();
      return { site: site.id, data: { site: site.id, created: true, prompt: promptView(row!), note: SCHEDULED_SPEND_NOTE } };
    } catch (error) {
      if (isUniqueViolation(error)) throw new McpToolError("Another tracked prompt for this site already has that text.");
      throw error;
    }
  },
});

export const deleteAiPrompt = defineTool({
  name: "delete_ai_prompt",
  title: "Delete a tracked AI prompt",
  description: "Stop tracking one AI prompt. A prompt with stored observations is deactivated so its history is kept (re-enable with upsert_ai_prompt active=true); one without observations is deleted. Free.",
  kind: "manage",
  input: z.object({ site: siteArg, id: z.string().uuid().describe("Prompt id from list_ai_prompts.") }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run({ site, id }) {
    requireDatabase();
    await requireSite(site);
    const [existing] = await db().select().from(schema.aiTrackingPrompts).where(and(eq(schema.aiTrackingPrompts.id, id), eq(schema.aiTrackingPrompts.siteSlug, site))).limit(1);
    if (!existing) throw new McpToolError(`Prompt ${id} was not found for ${site}.`);
    const [usage] = await db().select({ observations: count() }).from(schema.aiResponseObservations).where(eq(schema.aiResponseObservations.promptId, id));
    const observations = Number(usage?.observations ?? 0);
    if (observations > 0) {
      await db().update(schema.aiTrackingPrompts).set({ active: false, updatedAt: new Date() }).where(eq(schema.aiTrackingPrompts.id, id));
      return { site, data: { site, id, action: "deactivated", observationsKept: observations } };
    }
    await db().delete(schema.aiTrackingPrompts).where(eq(schema.aiTrackingPrompts.id, id));
    return { site, data: { site, id, action: "deleted", observationsKept: 0 } };
  },
});

/* ---------------------------- Rank tracking keywords ---------------------- */

type RankKeywordRow = typeof schema.rankTrackingKeywords.$inferSelect;

function rankKeywordView(row: RankKeywordRow | Record<string, unknown>) {
  const item = row as RankKeywordRow;
  return {
    id: item.id,
    keyword: item.keyword,
    locationCode: item.locationCode,
    languageCode: item.languageCode,
    device: item.device,
    cadence: item.cadence,
    active: item.active,
    targetUrl: item.targetUrl,
    tags: item.tags,
    campaignId: item.campaignId,
    createdAt: iso(item.createdAt),
  };
}

export const listRankKeywords = defineTool({
  name: "list_rank_keywords",
  title: "List rank-tracking keywords",
  description: "List the keywords tracked for exact SERP positions on one site, with market, device, cadence, target URL, tags and campaign. Use get_rank_tracking for positions. Free.",
  kind: "manage",
  input: z.object({
    site: siteArg,
    includeInactive: z.boolean().default(true).describe("Include deactivated keywords (default true)."),
    limit: limitArg(200, 5000),
    offset: offsetArg,
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run({ site, includeInactive, limit, offset }) {
    await requireSite(site);
    const body = await callRouteOrThrow<{ campaigns?: Array<Record<string, unknown>>; keywords?: RankKeywordRow[] }>(listRankTrackingRoute, { path: "/api/rank-tracking", query: { site } });
    const keywords = (body.keywords ?? []).filter((row) => includeInactive || row.active).map(rankKeywordView).sort((a, b) => a.keyword.localeCompare(b.keyword));
    return {
      site,
      data: {
        site,
        campaigns: (body.campaigns ?? []).map((item) => ({ id: item.id, name: item.name, defaultCadence: item.defaultCadence ?? null, competitors: item.competitors ?? [] })),
        keywords: page(keywords, limit, offset),
      },
    };
  },
});

const HTTP_URL = z.string().trim().max(2000).regex(/^https?:\/\/\S+$/, "Use a full http(s) URL.");

export const upsertRankKeywords = defineTool({
  name: "upsert_rank_keywords",
  title: "Add or update rank-tracking keywords",
  description: "Add keywords to exact rank tracking for a site, or update ones already tracked in the same market and device (target URL, tags, cadence, active). Location and language default to the site's market. Keywords join `campaignId`, or the campaign named `campaignName` (default \"Claude MCP\"), created if missing. No spend now; scheduled checks spend against the site ceiling.",
  kind: "manage",
  input: z.object({
    site: siteArg,
    keywords: z.array(z.object({
      keyword: z.string().trim().min(1).max(400),
      targetUrl: HTTP_URL.nullable().optional().describe("Page expected to rank (null clears it)."),
      tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    })).min(1).max(500),
    locationCode: z.number().int().positive().optional().describe("DataForSEO location code (default: the site's market)."),
    languageCode: z.string().min(2).max(10).optional().describe("Default: the site's language."),
    device: z.enum(["desktop", "mobile"]).default("desktop"),
    cadence: z.enum(["daily", "weekly"]).optional().describe("Default weekly for new keywords."),
    active: z.boolean().optional(),
    campaignId: z.string().uuid().optional(),
    campaignName: z.string().trim().min(2).max(120).optional(),
  }),
  annotations: MANAGE,
  async run(args) {
    requireDatabase();
    const site = await requireSite(args.site);
    const locationCode = args.locationCode ?? site.dataForSeoLocationCode;
    if (!locationCode) throw new McpToolError(`${site.id} has no default DataForSEO location; pass locationCode.`);
    const languageCode = args.languageCode ?? site.dataForSeoLanguageCode ?? "en";
    const unique = [...new Map(args.keywords.map((item) => [item.keyword, item])).values()];

    return db().transaction(async (tx) => {
      let campaignId = args.campaignId ?? null;
      if (campaignId) {
        const [campaign] = await tx.select({ id: schema.rankTrackingCampaigns.id }).from(schema.rankTrackingCampaigns)
          .where(and(eq(schema.rankTrackingCampaigns.id, campaignId), eq(schema.rankTrackingCampaigns.siteSlug, site.id))).limit(1);
        if (!campaign) throw new McpToolError(`Campaign ${campaignId} was not found for ${site.id}.`);
      } else {
        const name = args.campaignName ?? "Claude MCP";
        const [campaign] = await tx.select({ id: schema.rankTrackingCampaigns.id }).from(schema.rankTrackingCampaigns)
          .where(and(eq(schema.rankTrackingCampaigns.siteSlug, site.id), eq(schema.rankTrackingCampaigns.name, name))).limit(1);
        campaignId = campaign?.id ?? (await tx.insert(schema.rankTrackingCampaigns).values({
          siteSlug: site.id,
          name,
          defaultCadence: args.cadence ?? "weekly",
          createdBy: MCP_ACTOR,
          updatedAt: new Date(),
        }).returning({ id: schema.rankTrackingCampaigns.id }))[0]!.id;
      }

      const existing = await tx.select().from(schema.rankTrackingKeywords).where(and(
        eq(schema.rankTrackingKeywords.siteSlug, site.id),
        eq(schema.rankTrackingKeywords.locationCode, locationCode),
        eq(schema.rankTrackingKeywords.device, args.device),
        inArray(schema.rankTrackingKeywords.keyword, unique.map((item) => item.keyword)),
      ));
      const byKeyword = new Map(existing.map((row) => [row.keyword, row]));
      const fresh = unique.filter((item) => !byKeyword.has(item.keyword));
      const added = fresh.length ? await tx.insert(schema.rankTrackingKeywords).values(fresh.map((item) => ({
        siteSlug: site.id,
        campaignId,
        keyword: item.keyword,
        locationCode,
        languageCode,
        device: args.device,
        targetUrl: item.targetUrl ?? null,
        tags: item.tags ?? [],
        cadence: args.cadence ?? "weekly",
        active: args.active ?? true,
      }))).onConflictDoNothing().returning() : [];

      const updated: RankKeywordRow[] = [];
      for (const item of unique) {
        const row = byKeyword.get(item.keyword);
        if (!row) continue;
        const changes = {
          ...(item.targetUrl !== undefined ? { targetUrl: item.targetUrl } : {}),
          ...(item.tags !== undefined ? { tags: item.tags } : {}),
          ...(args.cadence !== undefined ? { cadence: args.cadence } : {}),
          ...(args.active !== undefined ? { active: args.active } : {}),
          ...(args.campaignId !== undefined ? { campaignId } : {}),
        };
        if (!Object.keys(changes).length) continue;
        const [next] = await tx.update(schema.rankTrackingKeywords).set(changes).where(eq(schema.rankTrackingKeywords.id, row.id)).returning();
        if (next) updated.push(next);
      }
      return {
        site: site.id,
        data: {
          site: site.id,
          campaignId,
          locationCode,
          languageCode,
          device: args.device,
          added: added.map(rankKeywordView),
          updated: updated.map(rankKeywordView),
          unchanged: unique.length - added.length - updated.length,
          note: SCHEDULED_SPEND_NOTE,
        },
      };
    });
  },
});

export const deleteRankKeywords = defineTool({
  name: "delete_rank_keywords",
  title: "Delete rank-tracking keywords",
  description: "Stop tracking keywords by id (from list_rank_keywords). Keywords with stored rank history are deactivated so the history is kept (re-enable with upsert_rank_keywords active=true); keywords without history are deleted. Free.",
  kind: "manage",
  input: z.object({ site: siteArg, ids: z.array(z.string().uuid()).min(1).max(500) }),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run({ site, ids }) {
    requireDatabase();
    await requireSite(site);
    const wanted = [...new Set(ids)];
    return db().transaction(async (tx) => {
      const found = await tx.select({ id: schema.rankTrackingKeywords.id }).from(schema.rankTrackingKeywords)
        .where(and(eq(schema.rankTrackingKeywords.siteSlug, site), inArray(schema.rankTrackingKeywords.id, wanted)));
      const foundIds = found.map((row) => row.id);
      const withHistory = foundIds.length
        ? new Set((await tx.selectDistinct({ id: schema.dailyRankHistory.trackedKeywordId }).from(schema.dailyRankHistory)
          .where(inArray(schema.dailyRankHistory.trackedKeywordId, foundIds))).map((row) => row.id))
        : new Set<string>();
      const deactivated = foundIds.filter((id) => withHistory.has(id));
      const deleted = foundIds.filter((id) => !withHistory.has(id));
      if (deactivated.length) await tx.update(schema.rankTrackingKeywords).set({ active: false }).where(inArray(schema.rankTrackingKeywords.id, deactivated));
      if (deleted.length) await tx.delete(schema.rankTrackingKeywords).where(inArray(schema.rankTrackingKeywords.id, deleted));
      return { site, data: { site, deleted, deactivated, notFound: wanted.filter((id) => !foundIds.includes(id)) } };
    });
  },
});

export const MANAGE_TOOLS = [listAiPrompts, upsertAiPrompt, deleteAiPrompt, listRankKeywords, upsertRankKeywords, deleteRankKeywords];
