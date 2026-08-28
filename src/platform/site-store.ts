import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { DOMAINS, DOMAIN_MAP } from "@/data/domains";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { Domain } from "@/lib/types";
import type { ManagedSite, PortfolioGroup, SiteCostForecast } from "./types";
import { QA_GROUPS, QA_SITES } from "@/data/qa-fixtures";

function legacySite(domain: Domain): ManagedSite {
  return {
    ...domain,
    devices: ["desktop"],
    lifecycleStatus: "active",
    spendApproval: "approved",
    forecastMonthlyUsd: 0,
    approvedMonthlyUsd: null,
    budgetLimits: {},
    forecast: null,
    crawlMaxPages: 10000,
    backlinkLimit: 10000,
    monitoringSchedule: {},
    siteSettings: {},
    archivedAt: null,
    source: "registry",
    createdAt: null,
    updatedAt: null,
  };
}

type SiteRow = typeof schema.siteProfiles.$inferSelect;

function rowToSite(row: SiteRow): ManagedSite {
  return {
    id: row.slug,
    name: row.name,
    host: row.host,
    accent: row.accent,
    industry: row.industry,
    primaryMarket: row.primaryMarket,
    gscSite: row.gscProperty ?? "",
    ga4PropertyId: row.ga4Property,
    dataForSeoLocationCode: row.locationCode,
    dataForSeoLanguageCode: row.languageCode,
    devices: row.devices,
    lifecycleStatus: row.lifecycleStatus as ManagedSite["lifecycleStatus"],
    spendApproval: row.spendApproval,
    forecastMonthlyUsd: row.forecastMonthlyUsd,
    approvedMonthlyUsd: row.approvedMonthlyUsd,
    budgetLimits: row.budgetLimits,
    forecast: Object.keys(row.forecastDetails ?? {}).length
      ? (row.forecastDetails as unknown as SiteCostForecast)
      : null,
    crawlMaxPages: row.crawlMaxPages,
    backlinkLimit: row.backlinkLimit,
    monitoringSchedule: row.monitoringSchedule,
    siteSettings: row.siteSettings,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    source: "database",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Database sites override registry entries with the same slug. */
export async function listManagedSites(): Promise<ManagedSite[]> {
  if (process.env.QA_SYNTHETIC === "true") return QA_SITES;
  const fallback = DOMAINS.map(legacySite);
  if (!hasDatabase()) return fallback;
  const rows = await db().select().from(schema.siteProfiles).orderBy(asc(schema.siteProfiles.name));
  const bySlug = new Map(fallback.map((site) => [site.id, site]));
  for (const row of rows) bySlug.set(row.slug, rowToSite(row));
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getManagedSite(slug: string): Promise<ManagedSite | null> {
  if (process.env.QA_SYNTHETIC === "true") return QA_SITES.find((site) => site.id === slug) ?? null;
  if (hasDatabase()) {
    const [row] = await db()
      .select()
      .from(schema.siteProfiles)
      .where(eq(schema.siteProfiles.slug, slug))
      .limit(1);
    if (row) return rowToSite(row);
  }
  const legacy = DOMAIN_MAP[slug];
  return legacy ? legacySite(legacy) : null;
}

export async function isManagedSite(slug: string): Promise<boolean> {
  return (await getManagedSite(slug)) !== null;
}

export function paidJobsApproved(site: ManagedSite): boolean {
  return site.spendApproval === "approved" && site.lifecycleStatus !== "paused";
}

export async function listSiteConnections(siteSlugs: string[]) {
  if (process.env.QA_SYNTHETIC === "true") return [];
  if (!hasDatabase() || siteSlugs.length === 0) return [];
  return db()
    .select()
    .from(schema.siteConnections)
    .where(inArray(schema.siteConnections.siteSlug, siteSlugs));
}

export async function listPortfolioGroups(): Promise<PortfolioGroup[]> {
  if (process.env.QA_SYNTHETIC === "true") return QA_GROUPS;
  if (!hasDatabase()) return [];
  const [groups, memberships] = await Promise.all([
    db().select().from(schema.portfolioGroups).orderBy(asc(schema.portfolioGroups.sortOrder), asc(schema.portfolioGroups.name)),
    db().select().from(schema.siteGroupMemberships),
  ]);
  const sitesByGroup = new Map<string, string[]>();
  const primarySitesByGroup = new Map<string, string[]>();
  for (const membership of memberships) {
    const values = sitesByGroup.get(membership.groupId) ?? [];
    values.push(membership.siteSlug);
    sitesByGroup.set(membership.groupId, values);
    if (membership.isPrimary) {
      const primary = primarySitesByGroup.get(membership.groupId) ?? [];
      primary.push(membership.siteSlug);
      primarySitesByGroup.set(membership.groupId, primary);
    }
  }
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    parentId: group.parentId,
    sortOrder: group.sortOrder,
    siteSlugs: sitesByGroup.get(group.id) ?? [],
    primarySiteSlugs: primarySitesByGroup.get(group.id) ?? [],
  }));
}

/** Resolve direct and descendant membership for a group-scoped dashboard. */
export async function resolveGroupSiteSlugs(groupId: string): Promise<string[]> {
  const groups = await listPortfolioGroups();
  const byParent = new Map<string | null, PortfolioGroup[]>();
  for (const group of groups) {
    const siblings = byParent.get(group.parentId) ?? [];
    siblings.push(group);
    byParent.set(group.parentId, siblings);
  }
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const child of byParent.get(id) ?? []) visit(child.id);
  };
  visit(groupId);
  return [...new Set(groups.filter((group) => ids.has(group.id)).flatMap((group) => group.siteSlugs))];
}

export async function setSiteGroups(siteSlug: string, groupIds: string[], primaryGroupId?: string | null) {
  if (!hasDatabase()) return;
  await db().transaction(async (tx) => {
    await tx.delete(schema.siteGroupMemberships).where(eq(schema.siteGroupMemberships.siteSlug, siteSlug));
    if (groupIds.length) {
      await tx.insert(schema.siteGroupMemberships).values(
        [...new Set(groupIds)].map((groupId, sortOrder) => ({
          groupId,
          siteSlug,
          isPrimary: primaryGroupId ? groupId === primaryGroupId : sortOrder === 0,
          sortOrder,
        })),
      );
    }
  });
}

export async function listAiTrackingPrompts(siteSlug: string) {
  if (!hasDatabase()) return [];
  return db()
    .select()
    .from(schema.aiTrackingPrompts)
    .where(
      and(
        eq(schema.aiTrackingPrompts.siteSlug, siteSlug),
        eq(schema.aiTrackingPrompts.active, true),
      ),
    )
    .orderBy(asc(schema.aiTrackingPrompts.createdAt));
}

export async function listDueAiTrackingPrompts(siteSlug: string, now = new Date()) {
  if (!hasDatabase()) return [];
  return db()
    .select()
    .from(schema.aiTrackingPrompts)
    .where(
      and(
        eq(schema.aiTrackingPrompts.siteSlug, siteSlug),
        eq(schema.aiTrackingPrompts.active, true),
        lte(schema.aiTrackingPrompts.nextRunAt, now),
      ),
    )
    .orderBy(asc(schema.aiTrackingPrompts.nextRunAt), asc(schema.aiTrackingPrompts.createdAt));
}

export function registryPromptRunTimes(lastRunAt: Date | null, now = new Date()) {
  const nextRunAt = lastRunAt ? new Date(lastRunAt) : new Date(now);
  if (lastRunAt) nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 7);
  return { lastRunAt, nextRunAt };
}

/** Migrate legacy registry prompts into durable cadence rows. Existing AI
 * observations seed last/next run times, preventing the daily scheduler from
 * buying a nominally weekly fallback prompt again on the next day. */
export async function ensureRegistryAiTrackingPrompts(
  siteSlug: string,
  prompts: Array<{ prompt: string; topic: string }>,
) {
  if (!hasDatabase() || !prompts.length) return [];
  const promptTexts = prompts.map((item) => item.prompt);
  const observations = await db().select({
    prompt: schema.aiResponseObservations.prompt,
    capturedAt: schema.aiResponseObservations.capturedAt,
  }).from(schema.aiResponseObservations).where(and(
    eq(schema.aiResponseObservations.siteSlug, siteSlug),
    inArray(schema.aiResponseObservations.prompt, promptTexts),
  )).orderBy(desc(schema.aiResponseObservations.capturedAt));
  const lastByPrompt = new Map<string, Date>();
  for (const observation of observations) {
    if (!lastByPrompt.has(observation.prompt)) lastByPrompt.set(observation.prompt, observation.capturedAt);
  }
  await db().insert(schema.aiTrackingPrompts).values(prompts.map((item) => {
    const lastRunAt = lastByPrompt.get(item.prompt) ?? null;
    const schedule = registryPromptRunTimes(lastRunAt);
    return {
      siteSlug,
      prompt: item.prompt,
      topic: item.topic,
      platforms: ["chatgpt"],
      cadence: "weekly",
      priority: 60,
      sampleCount: 1,
      source: "registry",
      ...schedule,
    };
  })).onConflictDoNothing({ target: [schema.aiTrackingPrompts.siteSlug, schema.aiTrackingPrompts.prompt] });
  return listAiTrackingPrompts(siteSlug);
}

export async function markAiPromptRun(id: string, cadence: string, runAt = new Date()) {
  if (!hasDatabase()) return;
  const next = new Date(runAt);
  if (cadence === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (cadence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCDate(next.getUTCDate() + 7);
  await db().update(schema.aiTrackingPrompts).set({
    lastRunAt: runAt,
    nextRunAt: next,
    updatedAt: runAt,
  }).where(eq(schema.aiTrackingPrompts.id, id));
}

export async function listRankTrackingKeywords(siteSlug: string) {
  if (!hasDatabase()) return [];
  return db()
    .select()
    .from(schema.rankTrackingKeywords)
    .where(
      and(
        eq(schema.rankTrackingKeywords.siteSlug, siteSlug),
        eq(schema.rankTrackingKeywords.active, true),
      ),
    )
    .orderBy(asc(schema.rankTrackingKeywords.createdAt));
}
