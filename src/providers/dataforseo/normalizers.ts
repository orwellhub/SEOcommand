import type {
  Backlink,
  Competitor,
  CompetitionLevel,
  CrawlRun,
  DomainId,
  HealthBreakdown,
  Keyword,
  KeywordMonthlyPoint,
  KeywordResearchRow,
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
      trafficPotential: Math.round(num(it?.ranked_serp_element?.serp_item?.etv)),
      serpFeatures: [],
      trend: (kwInfo?.monthly_searches ?? [])
        .slice(0, 12)
        .map((m: Row) => num(m?.search_volume))
        .reverse(),
      targetUrl: str(serp?.url) || null,
    };
  });
}

/* ------------------------- Labs: keyword ideas -------------------------- */

/** Number or null — DataForSEO omits (nulls) metrics for low-signal keywords. */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function competitionLevel(v: unknown): CompetitionLevel | null {
  const s = str(v).toLowerCase();
  if (s === "low" || s === "medium" || s === "high") return s;
  return null;
}

function intentOrNull(row: Row): SearchIntent | null {
  const raw = str(row?.search_intent_info?.main_intent ?? row?.keyword_intent?.label).toLowerCase();
  if (raw.includes("transactional")) return "transactional";
  if (raw.includes("commercial")) return "commercial";
  if (raw.includes("navigational")) return "navigational";
  if (raw.includes("informational")) return "informational";
  return null;
}

/**
 * DataForSEO Labs "keyword_ideas" → canonical research rows (volume, keyword
 * difficulty, CPC, competition, intent, top-of-page bids, monthly history).
 */
export function normalizeKeywordIdeas(rows: Row[]): KeywordResearchRow[] {
  const items: Row[] = rows[0]?.items ?? rows ?? [];
  return items
    .map((it): KeywordResearchRow => {
      const info = it?.keyword_info ?? {};
      const monthly: KeywordMonthlyPoint[] = (info?.monthly_searches ?? [])
        .map((m: Row) => ({
          year: num(m?.year),
          month: num(m?.month),
          volume: num(m?.search_volume),
        }))
        .filter((m: KeywordMonthlyPoint) => m.year > 0);
      // trend: oldest→newest, capped to the most recent 12 months for the sparkline.
      const trend = monthly
        .slice()
        .sort((a, b) => a.year - b.year || a.month - b.month)
        .slice(-12)
        .map((m) => m.volume);
      return {
        keyword: str(it?.keyword),
        volume: numOrNull(info?.search_volume),
        difficulty: numOrNull(it?.keyword_properties?.keyword_difficulty),
        cpc: numOrNull(info?.cpc),
        competition: numOrNull(info?.competition),
        competitionLevel: competitionLevel(info?.competition_level),
        intent: intentOrNull(it),
        lowTopBid: numOrNull(info?.low_top_of_page_bid),
        highTopBid: numOrNull(info?.high_top_of_page_bid),
        trend,
        monthlySearches: monthly,
      };
    })
    .filter((r) => r.keyword.length > 0);
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
  return { visibility, estTraffic: Math.round(num(metrics?.etv)), buckets };
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
      estTraffic: Math.round(num(m?.etv)),
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

/**
 * OnPage check → issue metadata. Each entry maps a DataForSEO summary check
 * counter to a human issue with category, severity, fix and impact. Only checks
 * with a non-zero page count become issues — the counts are real crawl results.
 */
const CHECK_ISSUES: {
  key: string;
  title: string;
  category: string;
  severity: TechnicalIssue["severity"];
  fix: string;
  impact: string;
}[] = [
  { key: "is_4xx_code", title: "Pages returning 4xx errors", category: "Crawlability", severity: "high", fix: "Restore or redirect the failing URLs; update internal links pointing at them.", impact: "Recovered crawl budget and link equity." },
  { key: "is_5xx_code", title: "Pages returning 5xx errors", category: "Crawlability", severity: "critical", fix: "Investigate server errors on the affected URLs.", impact: "Restored crawlability of failing pages." },
  { key: "is_broken", title: "Broken pages", category: "Crawlability", severity: "high", fix: "Fix or redirect broken pages found in the crawl.", impact: "Fewer dead ends for crawlers and users." },
  { key: "no_index", title: "Pages excluded by noindex", category: "Indexability", severity: "medium", fix: "Confirm each noindex is intentional; remove where pages should rank.", impact: "Recovered indexable inventory." },
  { key: "canonical_to_another", title: "Pages canonicalised to another URL", category: "Canonicalisation", severity: "medium", fix: "Verify canonical targets consolidate the intended URLs.", impact: "Correct signal consolidation." },
  { key: "duplicate_title", title: "Duplicate title tags", category: "Metadata", severity: "medium", fix: "Write unique, intent-matched titles per template.", impact: "Reduced cannibalisation, clearer relevance." },
  { key: "duplicate_description", title: "Duplicate meta descriptions", category: "Metadata", severity: "low", fix: "Author unique descriptions for affected templates.", impact: "Improved SERP CTR control." },
  { key: "no_title", title: "Pages missing a title tag", category: "Metadata", severity: "high", fix: "Add descriptive title tags to the affected pages.", impact: "Restored core relevance signal." },
  { key: "no_description", title: "Pages missing meta descriptions", category: "Metadata", severity: "medium", fix: "Author 140–160 character descriptions for affected pages.", impact: "Improved organic CTR." },
  { key: "no_h1_tag", title: "Pages missing an H1 heading", category: "Content", severity: "low", fix: "Add a single descriptive H1 per page.", impact: "Clearer topical structure." },
  { key: "broken_links", title: "Broken internal links", category: "Internal linking", severity: "high", fix: "Update or remove links to missing targets.", impact: "Preserved equity flow and UX." },
  { key: "broken_resources", title: "Broken resources (js/css/img)", category: "Internal linking", severity: "medium", fix: "Fix or remove references to missing assets.", impact: "Clean rendering and fewer wasted requests.", },
  { key: "duplicate_content", title: "Duplicate content clusters", category: "Content", severity: "medium", fix: "Consolidate or differentiate near-duplicate pages; set canonicals.", impact: "Consolidated ranking signals." },
  { key: "is_http", title: "Pages served over HTTP", category: "HTTPS & security", severity: "high", fix: "Serve all pages and assets over HTTPS with redirects.", impact: "Restored secure-context guarantees." },
  { key: "high_loading_time", title: "Slow-loading pages", category: "Core Web Vitals", severity: "medium", fix: "Compress assets, defer non-critical JS, optimise the critical path.", impact: "Better CWV and user experience." },
  { key: "is_redirect", title: "Internal links via redirects", category: "Redirects", severity: "low", fix: "Point internal links directly at final URLs.", impact: "Faster crawl, fuller equity transfer." },
  { key: "no_image_alt", title: "Images missing alt text", category: "Accessibility / Images", severity: "low", fix: "Add descriptive alt text to content images.", impact: "Accessibility + image-search visibility." },
  { key: "seo_friendly_url_characters_check", title: "Non SEO-friendly URL characters", category: "Content", severity: "low", fix: "Normalise URL slugs on new content.", impact: "Cleaner, more shareable URLs." },
];

export function normalizeOnPageHealth(
  summary: Row | null,
  today = "",
): {
  breakdown: HealthBreakdown[];
  crawlRun: CrawlRun | null;
  issues: TechnicalIssue[];
  healthScore: number;
} {
  if (!summary) return { breakdown: [], crawlRun: null, issues: [], healthScore: 0 };
  const pm = summary?.page_metrics ?? {};
  const checks: Row = pm?.checks ?? {};
  const onpageScore = num(pm?.onpage_score, num(summary?.onpage_score));
  const domainName = str(summary?.domain_info?.name ?? summary?.target);
  const date = today || str(summary?.crawl_end_time).slice(0, 10);

  const issues: TechnicalIssue[] = CHECK_ISSUES.filter((c) => num(checks?.[c.key]) > 0).map(
    (c) => ({
      id: `onpage-${c.key}`,
      domainId: "",
      title: c.title,
      category: c.category,
      severity: c.severity,
      explanation: `The latest crawl of ${domainName || "the site"} found ${num(checks?.[c.key])} pages failing the "${c.key}" check.`,
      affectedPages: num(checks?.[c.key]),
      samplePages: [],
      evidence: `OnPage crawl check "${c.key}": ${num(checks?.[c.key])} affected pages.`,
      recommendedFix: c.fix,
      potentialImpact: c.impact,
      firstSeen: date,
      lastSeen: date,
      status: "open",
      taskId: null,
    }),
  );

  const catIssues = (cat: string) =>
    issues.filter((i) => i.category === cat).reduce((s, i) => s + i.affectedPages, 0);

  const breakdown: HealthBreakdown[] = [
    { category: "Crawlability", weight: 0.15, score: onpageScore, issues: catIssues("Crawlability") },
    { category: "Indexability", weight: 0.15, score: onpageScore, issues: catIssues("Indexability") },
    { category: "Metadata", weight: 0.1, score: onpageScore, issues: catIssues("Metadata") },
    { category: "Internal linking", weight: 0.1, score: onpageScore, issues: catIssues("Internal linking") },
    { category: "Canonicalisation", weight: 0.1, score: onpageScore, issues: catIssues("Canonicalisation") },
    { category: "Structured data", weight: 0.08, score: onpageScore, issues: 0 },
    { category: "HTTPS & security", weight: 0.07, score: onpageScore, issues: catIssues("HTTPS & security") },
    { category: "Content quality", weight: 0.05, score: onpageScore, issues: catIssues("Content") },
  ];

  const crawlRun: CrawlRun = {
    id: "dfs-crawl-latest",
    domainId: "",
    startedAt: str(summary?.crawl_start_time).slice(0, 10),
    completedAt: str(summary?.crawl_end_time).slice(0, 10),
    pagesCrawled: num(summary?.pages_crawled ?? pm?.links_internal),
    healthScore: Math.round(onpageScore),
    newIssues: issues.length,
    resolvedIssues: 0,
    status: summary?.crawl_progress === "finished" ? "completed" : "running",
  };

  return { breakdown, crawlRun, issues, healthScore: Math.round(onpageScore) };
}
