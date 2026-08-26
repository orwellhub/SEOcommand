import { and, asc, eq, inArray } from "drizzle-orm";
import { DOMAINS, DOMAIN_MAP } from "@/data/domains";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { Domain } from "@/lib/types";
import type { ManagedSite, SiteCostForecast } from "./types";

function legacySite(domain: Domain): ManagedSite {
  return {
    ...domain,
    devices: ["desktop"],
    lifecycleStatus: "active",
    spendApproval: "approved",
    forecastMonthlyUsd: 0,
    approvedMonthlyUsd: null,
    forecast: null,
    crawlMaxPages: 10000,
    backlinkLimit: 10000,
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
    forecast: Object.keys(row.forecastDetails ?? {}).length
      ? (row.forecastDetails as unknown as SiteCostForecast)
      : null,
    crawlMaxPages: row.crawlMaxPages,
    backlinkLimit: row.backlinkLimit,
    source: "database",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Database sites override registry entries with the same slug. */
export async function listManagedSites(): Promise<ManagedSite[]> {
  const fallback = DOMAINS.map(legacySite);
  if (!hasDatabase()) return fallback;
  const rows = await db().select().from(schema.siteProfiles).orderBy(asc(schema.siteProfiles.name));
  const bySlug = new Map(fallback.map((site) => [site.id, site]));
  for (const row of rows) bySlug.set(row.slug, rowToSite(row));
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getManagedSite(slug: string): Promise<ManagedSite | null> {
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
  if (!hasDatabase() || siteSlugs.length === 0) return [];
  return db()
    .select()
    .from(schema.siteConnections)
    .where(inArray(schema.siteConnections.siteSlug, siteSlugs));
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
