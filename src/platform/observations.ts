import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isoDate } from "@/lib/dates";
import type { Backlink, GscTotals, Keyword } from "@/lib/types";
import type {
  AiCrawlerAuditRow,
  AiObservationInput,
  BacklinkHistoryPoint,
  DetailedCrawlPage,
  KeywordGapRow,
  ManagedSite,
  TrackedRankingResult,
} from "./types";
import { createNotification } from "./notifications";
import type { OnPageResult } from "@/lib/live";
import type { DiscoveredAiOpportunity } from "./ai-opportunities";

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
      intent: schema.dailyRankHistory.intent,
      ownedFeatures: schema.dailyRankHistory.ownedFeatures,
      competitors: schema.dailyRankHistory.competitors,
    })
    .from(schema.dailyRankHistory)
    .where(inArray(schema.dailyRankHistory.trackedKeywordId, ids))
    .orderBy(schema.dailyRankHistory.trackedKeywordId, desc(schema.dailyRankHistory.capturedOn));
  const prior = new Map(previous.map((row) => [row.trackedKeywordId, row.position]));
  const priorDetail = new Map(previous.map((row) => [row.trackedKeywordId, row]));
  const today = isoDate(new Date());
  await db().insert(schema.dailyRankHistory).values(rows.map((row) => ({
    trackedKeywordId: row.trackedKeywordId,
    siteSlug: site.id,
    capturedOn: today,
    position: row.position,
    previousPosition: prior.get(row.trackedKeywordId) ?? null,
    url: row.url,
    serpFeatures: row.serpFeatures,
    ownedFeatures: row.ownedFeatures,
    intent: row.intent,
    competitors: row.competitors,
  }))).onConflictDoUpdate({
    target: [schema.dailyRankHistory.trackedKeywordId, schema.dailyRankHistory.capturedOn],
    set: {
      position: sql`excluded.position`,
      previousPosition: sql`excluded.previous_position`,
      url: sql`excluded.url`,
      serpFeatures: sql`excluded.serp_features`,
      ownedFeatures: sql`excluded.owned_features`,
      intent: sql`excluded.intent`,
      competitors: sql`excluded.competitors`,
    },
  });
  for (const row of rows) {
    const before = prior.get(row.trackedKeywordId);
    const detail = priorDetail.get(row.trackedKeywordId);
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
    if (detail?.intent && row.intent && detail.intent !== row.intent) await createNotification({ siteSlug: site.id, eventType: "serp_intent_change", severity: "high", title: `Search intent changed for “${row.keyword}”`, detail: `${detail.intent} → ${row.intent} on ${row.device}. Review the mapped page before rankings drift.`, actionUrl: "/serp-intelligence", fingerprint: `serp-intent:${site.id}:${row.trackedKeywordId}:${today}` });
    const lostFeatures = (detail?.ownedFeatures ?? []).filter((feature) => !row.ownedFeatures.includes(feature));
    if (lostFeatures.length) await createNotification({ siteSlug: site.id, eventType: "serp_feature_lost", severity: "high", title: `SERP feature lost for “${row.keyword}”`, detail: `Lost ${lostFeatures.join(", ")} on ${row.device}.`, actionUrl: "/serp-intelligence", fingerprint: `serp-feature:${site.id}:${row.trackedKeywordId}:${today}` });
    const previousLeader = detail?.competitors?.[0]?.host; const currentLeader = row.competitors[0]?.host;
    if (previousLeader && currentLeader && previousLeader !== currentLeader) await createNotification({ siteSlug: site.id, eventType: "serp_competitor_takeover", severity: "medium", title: `New SERP leader for “${row.keyword}”`, detail: `${currentLeader} replaced ${previousLeader} at the top of the tracked competitor set.`, actionUrl: "/serp-intelligence", fingerprint: `serp-leader:${site.id}:${row.trackedKeywordId}:${today}` });
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

export async function persistAiObservations(site: ManagedSite, observations: AiObservationInput[]) {
  if (!observations.length) return;
  const today = isoDate(new Date());
  const prior = await db().select({ mentioned: schema.aiResponseObservations.mentioned })
    .from(schema.aiResponseObservations)
    .where(and(
      eq(schema.aiResponseObservations.siteSlug, site.id),
      lt(schema.aiResponseObservations.capturedOn, today),
    ))
    .orderBy(desc(schema.aiResponseObservations.capturedOn))
    .limit(Math.max(10, observations.length * 2));

  const observationKey = (value: { siteSlug: string; prompt: string; platform: string; capturedOn: string; sampleIndex: number }) =>
    `${value.siteSlug}\0${value.prompt}\0${value.platform}\0${value.capturedOn}\0${value.sampleIndex}`;
  for (const chunk of batches(observations, 200)) {
    await db().transaction(async (tx) => {
      const saved = await tx.insert(schema.aiResponseObservations).values(chunk.map((observation) => ({
        promptId: observation.promptId,
        siteSlug: observation.siteSlug,
        prompt: observation.prompt,
        topic: observation.topic,
        platform: observation.platform,
        modelName: observation.modelName,
        sampleIndex: observation.sampleIndex,
        capturedOn: observation.capturedOn,
        mentioned: observation.mentioned,
        cited: observation.cited,
        recommendationPosition: observation.recommendationPosition,
        sentiment: observation.sentiment,
        confidence: observation.confidence,
        responseText: observation.responseText,
        responseHash: observation.responseHash,
        fanOutQueries: observation.fanOutQueries,
        raw: observation.raw,
        costUsd: observation.costUsd,
      }))).onConflictDoUpdate({
        target: [
          schema.aiResponseObservations.siteSlug,
          schema.aiResponseObservations.prompt,
          schema.aiResponseObservations.platform,
          schema.aiResponseObservations.capturedOn,
          schema.aiResponseObservations.sampleIndex,
        ],
        set: {
          promptId: sql`excluded.prompt_id`,
          topic: sql`excluded.topic`,
          modelName: sql`excluded.model_name`,
          mentioned: sql`excluded.mentioned`,
          cited: sql`excluded.cited`,
          recommendationPosition: sql`excluded.recommendation_position`,
          sentiment: sql`excluded.sentiment`,
          confidence: sql`excluded.confidence`,
          responseText: sql`excluded.response_text`,
          responseHash: sql`excluded.response_hash`,
          fanOutQueries: sql`excluded.fan_out_queries`,
          raw: sql`excluded.raw`,
          costUsd: sql`excluded.cost_usd`,
          capturedAt: new Date(),
        },
      }).returning({
        id: schema.aiResponseObservations.id,
        siteSlug: schema.aiResponseObservations.siteSlug,
        prompt: schema.aiResponseObservations.prompt,
        platform: schema.aiResponseObservations.platform,
        capturedOn: schema.aiResponseObservations.capturedOn,
        sampleIndex: schema.aiResponseObservations.sampleIndex,
      });
      const ids = saved.map((row) => row.id);
      if (!ids.length) return;
      const idByKey = new Map(saved.map((row) => [observationKey(row), row.id]));
      await Promise.all([
        tx.delete(schema.aiResponseCitations).where(inArray(schema.aiResponseCitations.observationId, ids)),
        tx.delete(schema.aiResponseEntities).where(inArray(schema.aiResponseEntities.observationId, ids)),
      ]);
      const citationValues = chunk.flatMap((observation) => {
        const observationId = idByKey.get(observationKey(observation));
        return observationId ? observation.citations.map((citation) => ({ observationId, ...citation })) : [];
      });
      const entityValues = chunk.flatMap((observation) => {
        const observationId = idByKey.get(observationKey(observation));
        return observationId ? observation.entities.map((entity) => ({ observationId, ...entity })) : [];
      });
      for (const rows of batches(citationValues, 500)) await tx.insert(schema.aiResponseCitations).values(rows);
      for (const rows of batches(entityValues, 500)) await tx.insert(schema.aiResponseEntities).values(rows);
    });
  }

  const misses = observations.filter((item) => !item.mentioned);
  const priorRate = prior.length ? prior.filter((item) => item.mentioned).length / prior.length : 1;
  const currentRate = 1 - misses.length / observations.length;
  if (prior.length && priorRate - currentRate >= 0.2) {
    await createNotification({
      siteSlug: site.id,
      eventType: "ai_visibility_drop",
      severity: priorRate - currentRate >= 0.4 ? "high" : "medium",
      title: `AI mention rate fell ${Math.round((priorRate - currentRate) * 100)} points`,
      detail: `${site.name} was absent from ${misses.length} of ${observations.length} checks in the latest run.`,
      actionUrl: "/ai-visibility",
      fingerprint: `ai-drop:${site.id}:${today}`,
    });
  }
}

export async function persistAiCrawlerAudit(siteSlug: string, rows: AiCrawlerAuditRow[]) {
  if (!rows.length) return;
  const today = isoDate(new Date());
  await db().insert(schema.aiCrawlerAudits).values(rows.map((row) => ({
    siteSlug,
    capturedOn: today,
    bot: row.bot,
    category: row.category,
    access: row.access,
    evidence: row.evidence,
    robotsUrl: row.robotsUrl,
  }))).onConflictDoUpdate({
    target: [schema.aiCrawlerAudits.siteSlug, schema.aiCrawlerAudits.capturedOn, schema.aiCrawlerAudits.bot],
    set: { access: sql`excluded.access`, evidence: sql`excluded.evidence`, category: sql`excluded.category` },
  });
}

export async function persistAiPromptOpportunities(siteSlug: string, rows: DiscoveredAiOpportunity[]) {
  for (const chunk of batches(rows, 250)) {
    if (!chunk.length) continue;
    await db().insert(schema.aiPromptOpportunities).values(chunk.map((row) => ({
      siteSlug,
      ...row,
    }))).onConflictDoUpdate({
      target: [schema.aiPromptOpportunities.siteSlug, schema.aiPromptOpportunities.prompt],
      set: {
        priorityScore: sql`excluded.priority_score`,
        evidence: sql`excluded.evidence`,
        aiSearchVolume: sql`excluded.ai_search_volume`,
        updatedAt: new Date(),
      },
    });
  }
}
