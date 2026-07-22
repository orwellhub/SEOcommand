import type {
  Backlink,
  Competitor,
  CrawlRun,
  DomainId,
  HealthBreakdown,
  Keyword,
  PositionBucket,
  RankSnapshot,
  ReferringDomain,
  SearchIntent,
  SerpFeature,
  TechnicalIssue,
} from "@/lib/types";

/**
 * Best-effort normalisers from DataForSEO result rows to canonical internal
 * models. Access is intentionally defensive (optional chaining + defaults) so a
 * minor payload-shape variation degrades to a sensible value rather than
 * throwing. Verify field paths against live payloads when going live; the shapes
 * below follow DataForSEO's documented responses.
 */

type Row = Record<string, any>;

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}

const SERP_TYPE_MAP: Record<string, SerpFeature> = {
  featured_snippet: "featured_snippet",
  people_also_ask: "people_also_ask",
  local_pack: "local_pack",
  images: "image_pack",
  video: "video",
  ai_overview: "ai_overview",
  knowledge_graph: "knowledge_panel",
  top_stories: "top_stories",
};

function mapSerpFeatures(items: Row[] | undefined): SerpFeature[] {
  if (!items) return [];
  const out = new Set<SerpFeature>();
  for (const it of items) {
    const f = SERP_TYPE_MAP[str(it?.type)];
    if (f) out.add(f);
  }
  return [...out];
}

function classifyIntent(row: Row): SearchIntent {
  const info = str(row?.keyword_intent?.label ?? row?.search_intent_info?.main_intent);
  if (info.includes("transactional")) return "transactional";
  if (info.includes("commercial")) return "commercial";
  if (info.includes("navigational")) return "navigational";
  return "informational";
}

/* --------------------------- Labs: ranked keywords ---------------------- */

export function normalizeRankedKeywords(rows: Row[], domainId: DomainId): Keyword[] {
  const items: Row[] = rows[0]?.items ?? rows ?? [];
  return items.map((it, i) => {
    const kd = it?.keyword_data ?? {};
    const kwInfo = kd?.keyword_info ?? {};
    const serp = it?.ranked_serp_element?.serp_item ?? {};
    const position = num(serp?.rank_absolute, 0) || null;
    return {
      id: `${domainId}-dfs-kw-${i + 1}`,
      domainId,
      keyword: str(kd?.keyword),
      location: str(kwInfo?.location, ""),
      intent: classifyIntent(kd),
      volume: num(kwInfo?.search_volume),
      difficulty: num(kd?.keyword_properties?.keyword_difficulty),
      cpc: num(kwInfo?.cpc),
      competition: num(kwInfo?.competition),
      position,
      prevPosition: num(serp?.rank_changes?.previous_rank_absolute, position ?? 0) || position,
      competitorPositions: {},
      trafficPotential: num(it?.ranked_serp_element?.serp_item?.etv),
      serpFeatures: [],
      trend: (kwInfo?.monthly_searches ?? [])
        .slice(0, 12)
        .map((m: Row) => num(m?.search_volume))
        .reverse(),
      targetUrl: str(serp?.url) || null,
    };
  });
}

export function rankedKeywordsToSnapshots(rows: Row[], domainId: DomainId, capturedOn: string): RankSnapshot[] {
  const items: Row[] = rows[0]?.items ?? rows ?? [];
  return items
    .map((it): RankSnapshot | null => {
      const kd = it?.keyword_data ?? {};
      const serp = it?.ranked_serp_element?.serp_item ?? {};
      const position = num(serp?.rank_absolute);
      if (!position) return null;
      return {
        keywordId: str(kd?.keyword),
        keyword: str(kd?.keyword),
        date: capturedOn,
        position,
        prevPosition: num(serp?.rank_changes?.previous_rank_absolute, position),
        device: "desktop" as const,
        location: str(kd?.keyword_info?.location),
        url: str(serp?.url),
        volume: num(kd?.keyword_info?.search_volume),
        serpFeatures: [],
        tags: [],
      };
    })
    .filter((x): x is RankSnapshot => x !== null);
}

/* ----------------------- Labs: domain rank overview --------------------- */

export function normalizeDomainOverview(rows: Row[]): {
  visibility: number;
  estTraffic: number;
  buckets: PositionBucket[];
} {
  const metrics = rows[0]?.items?.[0]?.metrics?.organic ?? rows[0]?.metrics?.organic ?? {};
  const bucket = (label: string, count: number): PositionBucket => ({
    label,
    count: num(count),
    prevCount: num(count),
  });
  const buckets: PositionBucket[] = [
    bucket("1–3", num(metrics?.pos_1) + num(metrics?.pos_2_3)),
    bucket("4–10", num(metrics?.pos_4_10)),
    bucket("11–20", num(metrics?.pos_11_20)),
    bucket("21–50", num(metrics?.pos_21_30) + num(metrics?.pos_31_40) + num(metrics?.pos_41_50)),
    bucket("51–100", num(metrics?.pos_51_60) + num(metrics?.pos_61_70) + num(metrics?.pos_71_80) + num(metrics?.pos_81_90) + num(metrics?.pos_91_100)),
  ];
  // Visibility proxy: weighted share of top positions (transparent, not vendor score).
  const total = num(metrics?.count, 1);
  const weighted =
    (num(metrics?.pos_1) + num(metrics?.pos_2_3)) * 1 + num(metrics?.pos_4_10) * 0.5 + num(metrics?.pos_11_20) * 0.2;
  const visibility = Math.min(100, Math.round((weighted / Math.max(1, total)) * 100));
  return { visibility, estTraffic: num(metrics?.etv), buckets };
}

/* ------------------------- Labs: competitors ---------------------------- */

export function normalizeCompetitors(rows: Row[], domainId: DomainId): Competitor[] {
  const items: Row[] = rows[0]?.items ?? rows ?? [];
  return items.map((it, i) => {
    const m = it?.metrics?.organic ?? {};
    return {
      id: `${domainId}-dfs-comp-${i + 1}`,
      domainId,
      host: str(it?.domain),
      commonKeywords: num(it?.intersections ?? it?.full_domain_metrics?.organic?.count),
      keywords: num(m?.count),
      authority: num(it?.rank),
      estTraffic: num(m?.etv),
      overlapPct: num(it?.intersections) && num(m?.count) ? Math.round((num(it?.intersections) / num(m?.count)) * 1000) / 10 : 0,
      trend: "flat",
    };
  });
}

/* ------------------------------ Backlinks ------------------------------- */

export function normalizeBacklinks(rows: Row[], domainId: DomainId): Backlink[] {
  const items: Row[] = rows[0]?.items ?? rows ?? [];
  return items.map((it, i) => ({
    id: `${domainId}-dfs-bl-${i + 1}`,
    domainId,
    sourceDomain: str(it?.domain_from),
    sourceUrl: str(it?.url_from),
    targetUrl: str(it?.url_to),
    anchor: str(it?.anchor),
    authority: num(it?.rank),
    follow: it?.dofollow === true,
    firstSeen: str(it?.first_seen).slice(0, 10),
    lastSeen: str(it?.last_seen ?? it?.last_visited).slice(0, 10),
    status: it?.is_new ? "new" : it?.is_lost ? "lost" : "active",
    toxicity: num(it?.backlink_spam_score),
  }));
}

export function normalizeReferringDomains(rows: Row[], domainId: DomainId): ReferringDomain[] {
  const items: Row[] = rows[0]?.items ?? rows ?? [];
  return items.map((it, i) => ({
    id: `${domainId}-dfs-rd-${i + 1}`,
    domainId,
    host: str(it?.domain),
    authority: num(it?.rank),
    backlinks: num(it?.backlinks),
    firstSeen: str(it?.first_seen).slice(0, 10),
    follow: num(it?.referring_links_types?.anchor) >= 0 ? it?.dofollow !== false : true,
    topicalRelevance: num(it?.rank),
  }));
}

export function backlinkSummaryCounts(rows: Row[]): {
  backlinks: number;
  referringDomains: number;
  rank: number;
} {
  const s = rows[0] ?? {};
  return {
    backlinks: num(s?.backlinks),
    referringDomains: num(s?.referring_domains ?? s?.referring_main_domains),
    rank: num(s?.rank),
  };
}

/* -------------------------------- OnPage -------------------------------- */

export function normalizeOnPageHealth(summary: Row | null): {
  breakdown: HealthBreakdown[];
  crawlRun: CrawlRun | null;
  issues: TechnicalIssue[];
} {
  if (!summary) return { breakdown: [], crawlRun: null, issues: [] };
  const pm = summary?.page_metrics ?? {};
  const checks: Row = pm?.checks ?? {};
  const onpageScore = num(pm?.onpage_score, num(summary?.onpage_score));

  const breakdown: HealthBreakdown[] = [
    { category: "Crawlability", weight: 0.15, score: onpageScore, issues: num(checks?.is_4xx_code) + num(checks?.is_5xx_code) },
    { category: "Indexability", weight: 0.15, score: onpageScore, issues: num(checks?.no_index) },
    { category: "Metadata", weight: 0.1, score: onpageScore, issues: num(checks?.no_title) + num(checks?.no_description) },
    { category: "Internal linking", weight: 0.1, score: onpageScore, issues: num(checks?.broken_links) },
    { category: "Canonicalisation", weight: 0.1, score: onpageScore, issues: num(checks?.canonical) },
    { category: "Structured data", weight: 0.08, score: onpageScore, issues: num(checks?.no_microdata) },
    { category: "HTTPS & security", weight: 0.07, score: onpageScore, issues: num(checks?.is_http) },
    { category: "Content quality", weight: 0.05, score: onpageScore, issues: num(checks?.low_content_rate) },
  ];

  const crawlRun: CrawlRun = {
    id: "dfs-crawl-latest",
    domainId: "mortgagecompare",
    startedAt: str(summary?.crawl_start_time).slice(0, 10),
    completedAt: str(summary?.crawl_end_time).slice(0, 10),
    pagesCrawled: num(summary?.crawl_progress === "finished" ? summary?.pages_crawled ?? pm?.links_internal : 0),
    healthScore: Math.round(onpageScore),
    newIssues: 0,
    resolvedIssues: 0,
    status: summary?.crawl_progress === "finished" ? "completed" : "running",
  };

  return { breakdown, crawlRun, issues: [] };
}
