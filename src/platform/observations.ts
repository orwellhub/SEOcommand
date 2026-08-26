import { createHash } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isoDate } from "@/lib/dates";
import type { Backlink, GscTotals, Keyword } from "@/lib/types";
import type { BacklinkHistoryPoint, DetailedCrawlPage, KeywordGapRow, ManagedSite, TrackedRankingResult } from "./types";
import { createNotification } from "./notifications";
import type { OnPageResult } from "@/lib/live";

function batches<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function seedTrackedKeywords(site: ManagedSite, keywords: Keyword[], limit: number) {
  const selected = keywords.filter((keyword) => keyword.keyword).slice(0, Math.max(1, limit));
  const values = selected.flatMap((keyword) => site.devices.map((device) => ({
    siteSlug: site.id,
    keyword: keyword.keyword,
    locationCode: site.dataForSeoLocationCode!,
    languageCode: site.dataForSeoLanguageCode,
    device,
    targetUrl: keyword.targetUrl,
    tags: [keyword.intent],
  })));
  for (const chunk of batches(values)) {
    await db().insert(schema.rankTrackingKeywords).values(chunk).onConflictDoNothing();
  }
  return values.length;
}

export async function persistDailyRankings(site: ManagedSite, rows: TrackedRankingResult[]) {
  if (!rows.length) return;
  const ids = rows.map((row) => row.trackedKeywordId);
  const previous = await db()
    .selectDistinctOn([schema.dailyRankHistory.trackedKeywordId], {
      trackedKeywordId: schema.dailyRankHistory.trackedKeywordId,
      position: schema.dailyRankHistory.position,
    })
    .from(schema.dailyRankHistory)
    .where(inArray(schema.dailyRankHistory.trackedKeywordId, ids))
    .orderBy(schema.dailyRankHistory.trackedKeywordId, desc(schema.dailyRankHistory.capturedOn));
  const prior = new Map(previous.map((row) => [row.trackedKeywordId, row.position]));
  const today = isoDate(new Date());
  await db().insert(schema.dailyRankHistory).values(rows.map((row) => ({
    trackedKeywordId: row.trackedKeywordId,
    siteSlug: site.id,
    capturedOn: today,
    position: row.position,
    previousPosition: prior.get(row.trackedKeywordId) ?? null,
    url: row.url,
    serpFeatures: row.serpFeatures,
  }))).onConflictDoUpdate({
    target: [schema.dailyRankHistory.trackedKeywordId, schema.dailyRankHistory.capturedOn],
    set: {
      position: sql`excluded.position`,
      previousPosition: sql`excluded.previous_position`,
      url: sql`excluded.url`,
      serpFeatures: sql`excluded.serp_features`,
    },
  });
  for (const row of rows) {
    const before = prior.get(row.trackedKeywordId);
    if (before != null && row.position != null && row.position - before >= 5) {
      await createNotification({
        siteSlug: site.id,
        eventType: "rank_drop",
        severity: row.position - before >= 10 ? "high" : "medium",
        title: `“${row.keyword}” dropped ${row.position - before} positions`,
        detail: `${site.name} moved from position ${before} to ${row.position} on ${row.device}.`,
        actionUrl: "/rankings",
        fingerprint: `rank-drop:${site.id}:${row.trackedKeywordId}:${today}`,
      });
    }
  }
}

export async function persistDetailedCrawl(
  site: ManagedSite,
  providerTaskId: string,
  result: OnPageResult,
  pages: DetailedCrawlPage[],
) {
  const [run] = await db().insert(schema.detailedCrawlRuns).values({
    siteSlug: site.id,
    providerTaskId,
    status: "completed",
    maxPages: site.crawlMaxPages,
    pagesCrawled: pages.length,
    healthScore: result.healthScore,
    completedAt: new Date(),
  }).returning();
  if (!run) return;
  for (const chunk of batches(pages, 250)) {
    await db().insert(schema.detailedCrawlPages).values(chunk.map((page) => ({
      runId: run.id,
      siteSlug: site.id,
      ...page,
    }))).onConflictDoNothing();
  }
  const today = isoDate(new Date());
  for (const issue of result.issues.filter((item) => item.severity === "critical" || item.severity === "high")) {
    await createNotification({
      siteSlug: site.id,
      eventType: "technical_issue",
      severity: issue.severity,
      title: issue.title,
      detail: `${issue.affectedPages} pages affected in the latest ${pages.length.toLocaleString()}-page crawl.`,
      actionUrl: "/site-audit",
      fingerprint: `crawl:${site.id}:${issue.id}:${today}`,
    });
  }
}

export async function persistKeywordGaps(site: ManagedSite, rows: KeywordGapRow[]) {
  const today = isoDate(new Date());
  for (const chunk of batches(rows, 400)) {
    await db().insert(schema.keywordGapHistory).values(chunk.map((row) => ({
      siteSlug: site.id,
      capturedOn: today,
      ...row,
    }))).onConflictDoUpdate({
      target: [
        schema.keywordGapHistory.siteSlug,
        schema.keywordGapHistory.competitorHost,
        schema.keywordGapHistory.keyword,
        schema.keywordGapHistory.capturedOn,
      ],
      set: {
        sitePosition: sql`excluded.site_position`,
        competitorPosition: sql`excluded.competitor_position`,
        volume: sql`excluded.volume`,
        difficulty: sql`excluded.difficulty`,
        intent: sql`excluded.intent`,
        trafficPotential: sql`excluded.traffic_potential`,
      },
    });
  }
}

function linkFingerprint(link: Backlink): string {
  return createHash("sha256").update(`${link.sourceUrl}\0${link.targetUrl}\0${link.anchor}`).digest("hex");
}

export async function persistBacklinkLedger(
  site: ManagedSite,
  links: Backlink[],
  history: BacklinkHistoryPoint[],
) {
  for (const chunk of batches(links, 300)) {
    await db().insert(schema.backlinkLedgerEntries).values(chunk.map((link) => ({
      siteSlug: site.id,
      fingerprint: linkFingerprint(link),
      sourceDomain: link.sourceDomain,
      sourceUrl: link.sourceUrl,
      targetUrl: link.targetUrl,
      anchor: link.anchor,
      authority: link.authority,
      follow: link.follow,
      toxicity: link.toxicity,
      status: link.status,
      firstSeen: link.firstSeen || null,
      lastSeen: link.lastSeen || null,
      lastObservedAt: new Date(),
    }))).onConflictDoUpdate({
      target: [schema.backlinkLedgerEntries.siteSlug, schema.backlinkLedgerEntries.fingerprint],
      set: {
        status: sql`excluded.status`,
        lastSeen: sql`excluded.last_seen`,
        lastObservedAt: sql`now()`,
        authority: sql`excluded.authority`,
        toxicity: sql`excluded.toxicity`,
      },
    });
  }
  for (const point of history) {
    await db().insert(schema.backlinkProfileHistory).values({
      siteSlug: site.id,
      capturedOn: point.date,
      backlinks: point.backlinks,
      referringDomains: point.referringDomains,
      newBacklinks: point.newBacklinks,
      lostBacklinks: point.lostBacklinks,
      newReferringDomains: point.newReferringDomains,
      lostReferringDomains: point.lostReferringDomains,
      rank: point.rank,
      raw: point.raw,
    }).onConflictDoUpdate({
      target: [schema.backlinkProfileHistory.siteSlug, schema.backlinkProfileHistory.capturedOn],
      set: {
        backlinks: point.backlinks,
        referringDomains: point.referringDomains,
        newBacklinks: point.newBacklinks,
        lostBacklinks: point.lostBacklinks,
        newReferringDomains: point.newReferringDomains,
        lostReferringDomains: point.lostReferringDomains,
        rank: point.rank,
        raw: point.raw,
      },
    });
  }
  const latest = history.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latest?.lostBacklinks) {
    await createNotification({
      siteSlug: site.id,
      eventType: "lost_backlink",
      severity: latest.lostBacklinks >= 25 ? "high" : "medium",
      title: `${latest.lostBacklinks.toLocaleString()} backlinks lost`,
      detail: `${site.name} lost ${latest.lostReferringDomains.toLocaleString()} referring domains in the latest historical interval.`,
      actionUrl: "/backlinks",
      fingerprint: `lost-backlinks:${site.id}:${latest.date}`,
    });
  }
}

export async function detectTrafficDrop(site: ManagedSite, current: GscTotals, previous?: GscTotals) {
  if (!previous || previous.clicks <= 0 || current.clicks >= previous.clicks) return;
  const dropPct = Math.round(((previous.clicks - current.clicks) / previous.clicks) * 100);
  if (dropPct < 20) return;
  const today = isoDate(new Date());
  await createNotification({
    siteSlug: site.id,
    eventType: "traffic_drop",
    severity: dropPct >= 40 ? "high" : "medium",
    title: `Organic clicks fell ${dropPct}%`,
    detail: `${site.name} recorded ${current.clicks.toLocaleString()} clicks versus ${previous.clicks.toLocaleString()} in the prior stored window.`,
    actionUrl: `/domain/${site.id}`,
    fingerprint: `traffic-drop:${site.id}:${today}`,
  });
}
