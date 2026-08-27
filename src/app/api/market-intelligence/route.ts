import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { canAccessSite } from "@/platform/access";
import { buildAiVisibilityDashboard } from "@/platform/ai-read-model";
import {
  buildContentExplorer,
  buildCoverageMatrix,
  buildForecasts,
  buildLinkResearch,
  buildShareOfVoice,
} from "@/platform/market-intelligence";
import { getManagedSite } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim() ?? "";
  if (!siteSlug)
    return NextResponse.json(
      { error: "Choose a website first." },
      { status: 400 },
    );
  if (!(await canAccessSite(request, siteSlug)))
    return NextResponse.json(
      { error: "Website access required." },
      { status: 403 },
    );
  if (process.env.QA_SYNTHETIC === "true")
    return NextResponse.json(qa(siteSlug));
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Market intelligence requires DATABASE_URL." },
      { status: 503 },
    );
  const site = await getManagedSite(siteSlug);
  if (!site)
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const [rankRows, runs, prospects, links, gaps, work, dashboards, ai] =
    await Promise.all([
      db()
        .select({
          keyword: schema.rankTrackingKeywords.keyword,
          capturedOn: schema.dailyRankHistory.capturedOn,
          position: schema.dailyRankHistory.position,
          competitors: schema.dailyRankHistory.competitors,
          intent: schema.dailyRankHistory.intent,
          device: schema.rankTrackingKeywords.device,
          tags: schema.rankTrackingKeywords.tags,
          targetUrl: schema.rankTrackingKeywords.targetUrl,
          locationCode: schema.rankTrackingKeywords.locationCode,
        })
        .from(schema.dailyRankHistory)
        .innerJoin(
          schema.rankTrackingKeywords,
          eq(
            schema.rankTrackingKeywords.id,
            schema.dailyRankHistory.trackedKeywordId,
          ),
        )
        .where(eq(schema.dailyRankHistory.siteSlug, siteSlug))
        .orderBy(asc(schema.dailyRankHistory.capturedOn))
        .limit(30000),
      db()
        .select()
        .from(schema.competitorResearchRuns)
        .where(eq(schema.competitorResearchRuns.siteSlug, siteSlug))
        .orderBy(desc(schema.competitorResearchRuns.capturedAt))
        .limit(100),
      db()
        .select()
        .from(schema.linkProspects)
        .where(eq(schema.linkProspects.siteSlug, siteSlug))
        .orderBy(desc(schema.linkProspects.relevance))
        .limit(1000),
      db()
        .select()
        .from(schema.backlinkLedgerEntries)
        .where(eq(schema.backlinkLedgerEntries.siteSlug, siteSlug))
        .orderBy(desc(schema.backlinkLedgerEntries.lastObservedAt))
        .limit(2000),
      db()
        .select()
        .from(schema.keywordGapHistory)
        .where(eq(schema.keywordGapHistory.siteSlug, siteSlug))
        .orderBy(desc(schema.keywordGapHistory.capturedOn))
        .limit(10000),
      db()
        .select()
        .from(schema.workflowItems)
        .where(eq(schema.workflowItems.domainSlug, siteSlug))
        .orderBy(desc(schema.workflowItems.updatedAt))
        .limit(1000),
      db()
        .select()
        .from(schema.customDashboards)
        .where(eq(schema.customDashboards.scopeId, siteSlug))
        .orderBy(desc(schema.customDashboards.updatedAt))
        .limit(100),
      buildAiVisibilityDashboard(
        { id: siteSlug, label: site.name, siteSlugs: [siteSlug] },
        90,
      ),
    ]);
  return NextResponse.json({
    shareOfVoice: buildShareOfVoice(rankRows),
    content: buildContentExplorer(runs),
    links: buildLinkResearch(prospects, links),
    coverage: buildCoverageMatrix(rankRows, gaps),
    ai,
    forecasts: buildForecasts(work),
    dashboards,
    provenance: {
      source: "Stored DataForSEO, GSC, GA4 and AI observations",
      site: siteSlug,
      collectedAt: new Date().toISOString(),
      paidRefresh: false,
    },
  });
}

function qa(site: string) {
  const leaders = [
    {
      host: "owned",
      share: 31.4,
      previousShare: 27.8,
      change: 3.6,
      newcomer: false,
    },
    {
      host: "leader.example",
      share: 28.2,
      previousShare: 31.1,
      change: -2.9,
      newcomer: false,
    },
    {
      host: "newcomer.example",
      share: 13.5,
      previousShare: 0,
      change: 13.5,
      newcomer: true,
    },
  ];
  return {
    shareOfVoice: {
      latestDate: "2026-08-27",
      leaders,
      segments: [
        { segment: "commercial", keywords: 42, ownedShare: 34.2 },
        { segment: "mobile", keywords: 68, ownedShare: 27.1 },
      ],
      newcomers: [leaders[2]],
      winners: [leaders[0], leaders[2]],
      losers: [leaders[1]],
    },
    content: [
      {
        host: "leader.example",
        capturedAt: "2026-08-27",
        organicTraffic: 84000,
        publishingVelocity: 7.4,
        topPages: [
          {
            url: "https://leader.example/guides/mortgages",
            traffic: 12400,
            keywords: 940,
            trafficCost: 8000,
          },
        ],
        newPages: [
          {
            url: "https://leader.example/new-guide",
            traffic: 1200,
            keywords: 86,
            trafficCost: 500,
          },
        ],
        decliningPages: [],
        contentGaps: [
          {
            keyword: "mortgage comparison dubai",
            position: 2,
            volume: 2400,
            intent: "commercial",
          },
        ],
      },
    ],
    links: {
      intersect: [
        {
          id: "p1",
          sourceDomain: "publisher.example",
          authority: 67,
          status: "new",
          competitorHosts: ["leader.example"],
          reason: `Links to competitors but not ${site}`,
          relevance: 84,
        },
      ],
      unlinkedMentions: [],
      brokenOpportunities: [
        {
          id: "l1",
          sourceDomain: "news.example",
          sourceUrl: "https://news.example/old",
          targetUrl: `https://${site}.example/page`,
          authority: 61,
          status: "lost",
        },
      ],
      newLinks: [],
      crm: { discovered: 1, drafted: 0, contacted: 0 },
    },
    coverage: {
      markets: ["2784", "2826"],
      services: ["commercial", "informational"],
      cells: [
        {
          service: "commercial",
          market: "2784",
          state: "strong",
          bestPosition: 4,
          demand: 5200,
          targetUrl: "/mortgages",
        },
        {
          service: "commercial",
          market: "2826",
          state: "missing",
          bestPosition: null,
          demand: 3100,
          targetUrl: null,
        },
        {
          service: "informational",
          market: "2784",
          state: "weak",
          bestPosition: 18,
          demand: 4800,
          targetUrl: "/guides",
        },
        {
          service: "informational",
          market: "2826",
          state: "missing",
          bestPosition: null,
          demand: 2200,
          targetUrl: null,
        },
      ],
    },
    ai: {
      summary: {
        checks: 120,
        mentionRate: 42,
        citationRate: 18,
        shareOfVoice: 24,
      },
      sources: [
        {
          domain: "authority.example",
          citations: 12,
          owned: false,
          urls: [],
          platforms: ["chatgpt"],
          prompts: ["best mortgage uae"],
        },
      ],
      competitors: [
        {
          name: "Leader",
          host: "leader.example",
          mentions: 38,
          shareOfVoice: 31,
        },
      ],
      opportunities: [
        {
          id: "a1",
          prompt: "best mortgage for expats",
          topic: "mortgages",
          priorityScore: 82,
          status: "suggested",
        },
      ],
      recommendations: [],
    },
    forecasts: [
      {
        executionType: "refresh_brief",
        samples: 5,
        eligible: true,
        confidence: "medium",
        assumption:
          "Based only on verified winning actions of the same type; it does not include seasonality or external market changes.",
        conservative: 7.5,
        base: 15,
        upside: 22.5,
      },
    ],
    dashboards: [],
    provenance: {
      source: "Synthetic stored observations",
      site,
      collectedAt: new Date().toISOString(),
      paidRefresh: false,
    },
    synthetic: true,
  };
}
