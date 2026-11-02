import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { SCAN_MODULES } from "./scan-policy";
import type { ScanModule } from "./types";

export type ScanFreshness = { lastUpdatedAt: string | null; lastUpdatedDate: string | null };

const DATASETS: Record<ScanModule, string[]> = {
  google: ["gsc_totals", "gsc_timeseries", "gsc_queries", "gsc_pages", "gsc_query_pages", "gsc_movers", "gsc_page_movers", "striking_distance", "share_of_market", "ga4_overview", "ga4_landing_pages", "ga4_dashboard", "ga4_channels", "ga4_sources"],
  rankings: ["daily_rankings"],
  keywords: ["keywords", "position_buckets", "visibility_point"],
  competitors: ["competitors", "keyword_gaps", "competitor_content_history"],
  technical: ["onpage"],
  backlinks: ["backlinks", "referring_domains", "backlink_history"],
  ai: ["ai_prompts", "ai_crawler_audit"],
  local: [],
  reliability: [],
  indexing: [],
  speed: [],
};

/** Read collection metadata only. Queued jobs and provider task IDs are not updates. */
export async function scanModuleFreshness(siteSlug: string): Promise<Record<ScanModule, ScanFreshness>> {
  const result = Object.fromEntries(SCAN_MODULES.map(({ id }) => [id, { lastUpdatedAt: null, lastUpdatedDate: null }])) as Record<ScanModule, ScanFreshness>;
  if (!hasDatabase() || process.env.QA_SYNTHETIC === "true") return result;

  const [snapshots, browser, inventory, reliability, local, rankings, observations, audits, competitors] = await Promise.all([
    db().selectDistinctOn([schema.datasetSnapshots.dataset], { dataset: schema.datasetSnapshots.dataset, provenance: schema.datasetSnapshots.provenance, createdAt: schema.datasetSnapshots.createdAt }).from(schema.datasetSnapshots).where(eq(schema.datasetSnapshots.domainSlug, siteSlug)).orderBy(schema.datasetSnapshots.dataset, desc(schema.datasetSnapshots.createdAt)),
    db().select({ at: schema.browserCrawlRuns.completedAt }).from(schema.browserCrawlRuns).where(and(eq(schema.browserCrawlRuns.siteSlug, siteSlug), eq(schema.browserCrawlRuns.status, "completed"))).orderBy(desc(schema.browserCrawlRuns.completedAt)).limit(1),
    db().select({ at: schema.detailedCrawlRuns.completedAt }).from(schema.detailedCrawlRuns).where(and(eq(schema.detailedCrawlRuns.siteSlug, siteSlug), eq(schema.detailedCrawlRuns.status, "completed"))).orderBy(desc(schema.detailedCrawlRuns.completedAt)).limit(1),
    db().select({ at: schema.reliabilityChecks.checkedAt }).from(schema.reliabilityChecks).where(eq(schema.reliabilityChecks.siteSlug, siteSlug)).orderBy(desc(schema.reliabilityChecks.checkedAt)).limit(1),
    db().select({ date: schema.localSeoSnapshots.capturedOn, at: sql<string | null>`${schema.localSeoSnapshots.profile} ->> '_collectedAt'` }).from(schema.localSeoSnapshots).where(eq(schema.localSeoSnapshots.siteSlug, siteSlug)).orderBy(desc(schema.localSeoSnapshots.capturedOn)).limit(500),
    db().select({ at: schema.dailyRankHistory.createdAt }).from(schema.dailyRankHistory).where(eq(schema.dailyRankHistory.siteSlug, siteSlug)).orderBy(desc(schema.dailyRankHistory.createdAt)).limit(1),
    db().select({ at: schema.aiResponseObservations.capturedAt }).from(schema.aiResponseObservations).where(eq(schema.aiResponseObservations.siteSlug, siteSlug)).orderBy(desc(schema.aiResponseObservations.capturedAt)).limit(1),
    db().select({ at: schema.aiCrawlerAudits.createdAt }).from(schema.aiCrawlerAudits).where(eq(schema.aiCrawlerAudits.siteSlug, siteSlug)).orderBy(desc(schema.aiCrawlerAudits.createdAt)).limit(1),
    db().select({ at: schema.competitorResearchRuns.capturedAt }).from(schema.competitorResearchRuns).where(eq(schema.competitorResearchRuns.siteSlug, siteSlug)).orderBy(desc(schema.competitorResearchRuns.capturedAt)).limit(1),
  ]);

  function record(module: ScanModule, value: unknown) {
    if (!(value instanceof Date) && typeof value !== "string") return;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return;
    const iso = date.toISOString();
    if (!result[module].lastUpdatedAt || iso > result[module].lastUpdatedAt!) result[module].lastUpdatedAt = iso;
  }
  const checks = await db().select({ kind: schema.commandRecords.kind, at: schema.commandRecords.updatedAt }).from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), eq(schema.commandRecords.status, "completed"), inArray(schema.commandRecords.kind, ["indexing", "speed"]))).orderBy(desc(schema.commandRecords.updatedAt)).limit(100);
  for (const check of checks) if (check.kind === "indexing" || check.kind === "speed") record(check.kind, check.at);
  for (const snapshot of snapshots) {
    const provenance = (snapshot.provenance ?? {}) as { collectedAt?: string; mode?: string };
    if (provenance.mode === "demo") continue;
    const at = provenance.collectedAt && Number.isFinite(Date.parse(provenance.collectedAt)) ? provenance.collectedAt : snapshot.createdAt;
    for (const { id } of SCAN_MODULES) if (DATASETS[id].includes(snapshot.dataset)) record(id, at);
  }
  for (const row of [...browser, ...inventory]) record("technical", row.at);
  for (const row of reliability) record("reliability", row.at);
  for (const row of rankings) record("rankings", row.at);
  for (const row of [...observations, ...audits]) record("ai", row.at);
  for (const row of competitors) record("competitors", row.at);
  for (const row of local) {
    record("local", row.at);
    if (!result.local.lastUpdatedDate || row.date > result.local.lastUpdatedDate) result.local.lastUpdatedDate = row.date;
  }
  // Older local snapshots recorded only a day. Never invent a collection time.
  if (result.local.lastUpdatedAt && result.local.lastUpdatedDate && result.local.lastUpdatedAt.slice(0, 10) < result.local.lastUpdatedDate) result.local.lastUpdatedAt = null;
  return result;
}
