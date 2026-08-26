import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { listManagedSites } from "./site-store";

export interface AiDashboardScope {
  id: string;
  label: string;
  siteSlugs: string[];
}

function rate(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export async function buildAiVisibilityDashboard(scope: AiDashboardScope, days = 90) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.min(Math.max(days, 7), 365));
  const sinceDate = since.toISOString().slice(0, 10);
  if (!scope.siteSlugs.length) return emptyDashboard(scope, days);

  const observationFilter = and(
    inArray(schema.aiResponseObservations.siteSlug, scope.siteSlugs),
    gte(schema.aiResponseObservations.capturedOn, sinceDate),
  );
  const entityFilter = and(
    observationFilter,
    sql`${schema.aiResponseEntities.entityType} in ('brand', 'competitor')`,
  );

  const [
    observations,
    observationSummaryRows,
    entitySummaryRows,
    trendRows,
    entityTrendRows,
    platformRows,
    sourceRows,
    competitorRows,
    opportunities,
    crawlerRows,
    trackedPrompts,
    sites,
  ] = await Promise.all([
    db().select().from(schema.aiResponseObservations)
      .where(observationFilter)
      .orderBy(desc(schema.aiResponseObservations.capturedAt))
      .limit(1500),
    db().select({
      checks: sql<number>`count(*)::int`,
      sitesMeasured: sql<number>`count(distinct ${schema.aiResponseObservations.siteSlug})::int`,
      mentions: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.mentioned} then 1 else 0 end), 0)::int`,
      citations: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.cited} then 1 else 0 end), 0)::int`,
      positives: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.sentiment} = 'positive' then 1 else 0 end), 0)::int`,
      avgPosition: sql<number | null>`avg(${schema.aiResponseObservations.recommendationPosition})::float`,
    }).from(schema.aiResponseObservations).where(observationFilter),
    db().select({
      total: sql<number>`count(*)::int`,
      owned: sql<number>`coalesce(sum(case when ${schema.aiResponseEntities.owned} then 1 else 0 end), 0)::int`,
    }).from(schema.aiResponseEntities)
      .innerJoin(schema.aiResponseObservations, eq(schema.aiResponseEntities.observationId, schema.aiResponseObservations.id))
      .where(entityFilter),
    db().select({
      date: schema.aiResponseObservations.capturedOn,
      checks: sql<number>`count(*)::int`,
      mentions: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.mentioned} then 1 else 0 end), 0)::int`,
      citations: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.cited} then 1 else 0 end), 0)::int`,
    }).from(schema.aiResponseObservations).where(observationFilter)
      .groupBy(schema.aiResponseObservations.capturedOn)
      .orderBy(schema.aiResponseObservations.capturedOn),
    db().select({
      date: schema.aiResponseObservations.capturedOn,
      total: sql<number>`count(*)::int`,
      owned: sql<number>`coalesce(sum(case when ${schema.aiResponseEntities.owned} then 1 else 0 end), 0)::int`,
    }).from(schema.aiResponseEntities)
      .innerJoin(schema.aiResponseObservations, eq(schema.aiResponseEntities.observationId, schema.aiResponseObservations.id))
      .where(entityFilter)
      .groupBy(schema.aiResponseObservations.capturedOn)
      .orderBy(schema.aiResponseObservations.capturedOn),
    db().select({
      platform: schema.aiResponseObservations.platform,
      checks: sql<number>`count(*)::int`,
      mentions: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.mentioned} then 1 else 0 end), 0)::int`,
      citations: sql<number>`coalesce(sum(case when ${schema.aiResponseObservations.cited} then 1 else 0 end), 0)::int`,
      avgPosition: sql<number | null>`avg(${schema.aiResponseObservations.recommendationPosition})::float`,
    }).from(schema.aiResponseObservations).where(observationFilter)
      .groupBy(schema.aiResponseObservations.platform),
    db().select({
      domain: schema.aiResponseCitations.domain,
      citations: sql<number>`count(*)::int`,
      owned: sql<boolean>`bool_or(${schema.aiResponseCitations.owned})`,
      urls: sql<string[]>`array_agg(distinct ${schema.aiResponseCitations.url})`,
      platforms: sql<string[]>`array_agg(distinct ${schema.aiResponseObservations.platform})`,
      prompts: sql<string[]>`array_agg(distinct ${schema.aiResponseObservations.prompt})`,
    }).from(schema.aiResponseCitations)
      .innerJoin(schema.aiResponseObservations, eq(schema.aiResponseCitations.observationId, schema.aiResponseObservations.id))
      .where(observationFilter)
      .groupBy(schema.aiResponseCitations.domain)
      .orderBy(desc(sql`count(*)`))
      .limit(250),
    db().select({
      name: schema.aiResponseEntities.name,
      host: schema.aiResponseEntities.host,
      owned: schema.aiResponseEntities.owned,
      mentions: sql<number>`count(*)::int`,
      positives: sql<number>`coalesce(sum(case when ${schema.aiResponseEntities.sentiment} = 'positive' then 1 else 0 end), 0)::int`,
      avgPosition: sql<number | null>`avg(${schema.aiResponseEntities.position})::float`,
    }).from(schema.aiResponseEntities)
      .innerJoin(schema.aiResponseObservations, eq(schema.aiResponseEntities.observationId, schema.aiResponseObservations.id))
      .where(entityFilter)
      .groupBy(schema.aiResponseEntities.name, schema.aiResponseEntities.host, schema.aiResponseEntities.owned)
      .orderBy(desc(sql`count(*)`))
      .limit(250),
    db().select().from(schema.aiPromptOpportunities)
      .where(inArray(schema.aiPromptOpportunities.siteSlug, scope.siteSlugs))
      .orderBy(desc(schema.aiPromptOpportunities.priorityScore))
      .limit(100),
    db().selectDistinctOn([schema.aiCrawlerAudits.siteSlug, schema.aiCrawlerAudits.bot])
      .from(schema.aiCrawlerAudits)
      .where(inArray(schema.aiCrawlerAudits.siteSlug, scope.siteSlugs))
      .orderBy(schema.aiCrawlerAudits.siteSlug, schema.aiCrawlerAudits.bot, desc(schema.aiCrawlerAudits.capturedOn)),
    db().select().from(schema.aiTrackingPrompts)
      .where(inArray(schema.aiTrackingPrompts.siteSlug, scope.siteSlugs))
      .orderBy(desc(schema.aiTrackingPrompts.priority))
      .limit(5000),
    listManagedSites(),
  ]);

  const observationIds = observations.map((item) => item.id);
  const [citations, entities] = observationIds.length ? await Promise.all([
    db().select().from(schema.aiResponseCitations).where(inArray(schema.aiResponseCitations.observationId, observationIds)),
    db().select().from(schema.aiResponseEntities).where(inArray(schema.aiResponseEntities.observationId, observationIds)),
  ]) : [[], []];
  const sitesBySlug = new Map(sites.map((item) => [item.id, item]));
  const observationSummary = observationSummaryRows[0] ?? { checks: 0, sitesMeasured: 0, mentions: 0, citations: 0, positives: 0, avgPosition: null };
  const entitySummary = entitySummaryRows[0] ?? { total: 0, owned: 0 };

  const summary = {
    checks: observationSummary.checks,
    sitesMeasured: observationSummary.sitesMeasured,
    mentionRate: rate(observationSummary.mentions, observationSummary.checks),
    citationRate: rate(observationSummary.citations, observationSummary.checks),
    avgRecommendationPosition: observationSummary.avgPosition == null ? null : Math.round(observationSummary.avgPosition * 10) / 10,
    positiveSentimentRate: rate(observationSummary.positives, observationSummary.mentions),
    shareOfVoice: rate(entitySummary.owned, entitySummary.total),
  };

  const entityTrend = new Map(entityTrendRows.map((item) => [item.date, item]));
  const trend = trendRows.map((item) => ({
    date: item.date,
    mentionRate: rate(item.mentions, item.checks),
    citationRate: rate(item.citations, item.checks),
    shareOfVoice: rate(entityTrend.get(item.date)?.owned ?? 0, entityTrend.get(item.date)?.total ?? 0),
  }));
  const platforms = platformRows.map((item) => ({
    platform: item.platform,
    checks: item.checks,
    mentionRate: rate(item.mentions, item.checks),
    citationRate: rate(item.citations, item.checks),
    avgPosition: item.avgPosition == null ? null : Math.round(item.avgPosition * 10) / 10,
  })).sort((a, b) => b.checks - a.checks);

  const latestKey = new Set<string>();
  const latestObservations = observations.filter((item) => {
    const key = `${item.siteSlug}\0${item.prompt}\0${item.platform}`;
    if (latestKey.has(key)) return false;
    latestKey.add(key);
    return true;
  }).slice(0, 300).map((item) => ({
    ...item,
    siteName: sitesBySlug.get(item.siteSlug)?.name ?? item.siteSlug,
    citations: citations.filter((citation) => citation.observationId === item.id),
    entities: entities.filter((entity) => entity.observationId === item.id),
  }));

  const sources = sourceRows.map((item) => ({
    ...item,
    urls: item.urls.slice(0, 5),
    platforms: item.platforms,
    prompts: item.prompts.slice(0, 5),
  }));
  const competitors = competitorRows.map((item) => ({
    name: item.name,
    host: item.host,
    mentions: item.mentions,
    owned: item.owned,
    positive: item.positives,
    positions: [] as number[],
    shareOfVoice: rate(item.mentions, entitySummary.total),
    positiveRate: rate(item.positives, item.mentions),
    avgPosition: item.avgPosition == null ? null : Math.round(item.avgPosition * 10) / 10,
  }));
  const crawlerAudit = crawlerRows.map((item) => ({
    ...item,
    siteName: sitesBySlug.get(item.siteSlug)?.name ?? item.siteSlug,
  }));

  const recommendations = [
    ...sources.filter((item) => !item.owned).slice(0, 5).map((item) => ({
      kind: "source_gap",
      title: `Build authority with ${item.domain}`,
      detail: `${item.domain} appeared in ${item.citations} measured citations across ${item.platforms.length} AI platforms.`,
      priority: Math.min(95, 55 + item.citations * 4),
      reviewOnly: true,
    })),
    ...latestObservations.filter((item) => !item.mentioned).slice(0, 5).map((item) => ({
      kind: "content_gap",
      title: `Answer “${item.prompt}”`,
      detail: `${item.siteName} was absent from the latest ${item.platform} response. Review its cited sources before drafting a stronger answer page.`,
      priority: 70,
      reviewOnly: true,
    })),
  ].sort((a, b) => b.priority - a.priority).slice(0, 10);

  return {
    scope: { ...scope, days }, summary, trend, platforms, observations: latestObservations,
    sources, competitors, opportunities, crawlerAudit, trackedPrompts, recommendations,
  };
}

function emptyDashboard(scope: AiDashboardScope, days: number) {
  return {
    scope: { ...scope, days },
    summary: { checks: 0, sitesMeasured: 0, mentionRate: 0, citationRate: 0, avgRecommendationPosition: null, positiveSentimentRate: 0, shareOfVoice: 0 },
    trend: [], platforms: [], observations: [], sources: [], competitors: [], opportunities: [], crawlerAudit: [], trackedPrompts: [], recommendations: [],
  };
}

export type AiVisibilityDashboard = Awaited<ReturnType<typeof buildAiVisibilityDashboard>>;
