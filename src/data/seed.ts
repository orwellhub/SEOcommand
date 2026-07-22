import type {
  AiPrompt,
  AlertItem,
  Backlink,
  Competitor,
  ContentItem,
  CrawlRun,
  DomainId,
  HealthBreakdown,
  Keyword,
  KeywordList,
  PositionBucket,
  ProviderConnection,
  Provenance,
  RankSnapshot,
  Recommendation,
  ReferringDomain,
  ReportSchedule,
  ReportTemplate,
  SerpFeature,
  Task,
  TechnicalIssue,
  UsageLedgerEntry,
} from "@/lib/types";
import { DOMAINS } from "./domains";
import {
  aiPromptSeedsFor,
  competitorHostsFor,
  locationFor,
  seedsFor,
} from "./keyword-seeds";
import { floatBetween, intBetween, pick, rngFor, series } from "@/lib/prng";
import { isoDaysAgo } from "@/lib/dates";

const ALL_SERP_FEATURES: SerpFeature[] = [
  "featured_snippet",
  "people_also_ask",
  "local_pack",
  "image_pack",
  "video",
  "sitelinks",
  "reviews",
  "top_stories",
  "ai_overview",
  "knowledge_panel",
];

function serpFeaturesFor(rng: () => number): SerpFeature[] {
  const n = intBetween(rng, 0, 3);
  const out = new Set<SerpFeature>();
  for (let i = 0; i < n; i++) out.add(pick(rng, ALL_SERP_FEATURES));
  return [...out];
}

/* ------------------------------- Keywords ------------------------------- */

function buildKeywords(domainId: DomainId): Keyword[] {
  const seeds = seedsFor(domainId);
  const competitors = competitorHostsFor(domainId);
  const location = locationFor(domainId);
  return seeds.map((seed, i) => {
    const rng = rngFor(`${domainId}:kw:${seed.keyword}`);
    const volume = intBetween(rng, 90, 22000);
    const difficulty = intBetween(rng, 8, 88);
    const hasPosition = rng() > 0.18;
    const position = hasPosition ? intBetween(rng, 1, 74) : null;
    const prevPosition =
      position == null ? null : Math.max(1, position + intBetween(rng, -9, 9));
    const competitorPositions: Record<string, number | null> = {};
    for (const c of competitors.slice(0, 3)) {
      competitorPositions[c] = rng() > 0.25 ? intBetween(rng, 1, 60) : null;
    }
    const ctr = position && position <= 10 ? 0.3 / position : 0.01;
    return {
      id: `${domainId}-kw-${i + 1}`,
      domainId,
      keyword: seed.keyword,
      location,
      intent: seed.intent,
      volume,
      difficulty,
      cpc: floatBetween(rng, 0.4, 14, 2),
      competition: floatBetween(rng, 0.1, 0.98, 2),
      position,
      prevPosition,
      competitorPositions,
      trafficPotential: Math.round(volume * ctr),
      serpFeatures: serpFeaturesFor(rng),
      trend: series(rng, 12, volume, volume * 0.12, intBetween(rng, -18, 22)),
      targetUrl: hasPosition
        ? `https://${DOMAINS.find((d) => d.id === domainId)!.host}/${seed.keyword.replace(/\s+/g, "-")}`
        : null,
    };
  });
}

const KEYWORDS: Record<DomainId, Keyword[]> = Object.fromEntries(
  DOMAINS.map((d) => [d.id, buildKeywords(d.id)]),
) as Record<DomainId, Keyword[]>;

function buildKeywordLists(domainId: DomainId): KeywordList[] {
  const kws = KEYWORDS[domainId];
  const groups: { name: string; desc: string; filter: (k: Keyword) => boolean }[] = [
    {
      name: "High-intent money terms",
      desc: "Transactional and commercial terms driving qualified enquiries",
      filter: (k) => k.intent === "transactional" || k.intent === "commercial",
    },
    {
      name: "Quick-win opportunities",
      desc: "Positions 4–15 with strong volume — realistic page-one targets",
      filter: (k) => k.position != null && k.position >= 4 && k.position <= 15,
    },
    {
      name: "Top of funnel / informational",
      desc: "Educational demand to capture with content",
      filter: (k) => k.intent === "informational",
    },
  ];
  return groups.map((g, i) => {
    const members = kws.filter(g.filter);
    const totalVolume = members.reduce((s, k) => s + k.volume, 0);
    const avgDifficulty = members.length
      ? Math.round(members.reduce((s, k) => s + k.difficulty, 0) / members.length)
      : 0;
    return {
      id: `${domainId}-list-${i + 1}`,
      domainId,
      name: g.name,
      description: g.desc,
      keywordCount: members.length,
      totalVolume,
      avgDifficulty,
      updatedAt: isoDaysAgo(intBetween(rngFor(`${domainId}:list:${i}`), 1, 12)),
    };
  });
}

/* ------------------------------- Rankings ------------------------------- */

function buildRankSnapshots(domainId: DomainId): RankSnapshot[] {
  return KEYWORDS[domainId]
    .filter((k) => k.position != null)
    .map((k) => {
      const rng = rngFor(`${domainId}:rank:${k.id}`);
      const tags: string[] = [];
      if (k.intent === "transactional" || k.intent === "commercial") tags.push("money");
      if (k.position! <= 3) tags.push("top-3");
      if (k.serpFeatures.includes("local_pack")) tags.push("local");
      return {
        keywordId: k.id,
        keyword: k.keyword,
        date: isoDaysAgo(0),
        position: k.position!,
        prevPosition: k.prevPosition!,
        device: rng() > 0.5 ? "mobile" : "desktop",
        location: k.location,
        url: k.targetUrl ?? "",
        volume: k.volume,
        serpFeatures: k.serpFeatures,
        tags,
      };
    });
}

function buildPositionBuckets(domainId: DomainId): PositionBucket[] {
  const kws = KEYWORDS[domainId].filter((k) => k.position != null);
  const buckets = [
    { label: "1–3", lo: 1, hi: 3 },
    { label: "4–10", lo: 4, hi: 10 },
    { label: "11–20", lo: 11, hi: 20 },
    { label: "21–50", lo: 21, hi: 50 },
    { label: "51–100", lo: 51, hi: 100 },
  ];
  return buckets.map((b) => {
    const count = kws.filter((k) => k.position! >= b.lo && k.position! <= b.hi).length;
    const prev = kws.filter(
      (k) => k.prevPosition! >= b.lo && k.prevPosition! <= b.hi,
    ).length;
    return { label: b.label, count, prevCount: prev };
  });
}

/* ------------------------------ Visibility ------------------------------ */

function buildVisibilitySeries(domainId: DomainId): { date: string; value: number }[] {
  const rng = rngFor(`${domainId}:vis`);
  const base =
    domainId === "mortgagecompare" ? 34 : domainId === "busrentalglobal" ? 27 : 41;
  const drift = domainId === "busrentalglobal" ? -6 : 14;
  const raw = series(rng, 90, base, 1.4, drift);
  return raw.map((v, i) => ({
    date: isoDaysAgo(89 - i),
    value: Math.min(100, Math.max(1, v)),
  }));
}

/* ----------------------------- Competitors ------------------------------ */

function buildCompetitors(domainId: DomainId): Competitor[] {
  return competitorHostsFor(domainId).map((host, i) => {
    const rng = rngFor(`${domainId}:comp:${host}`);
    const trends = ["up", "down", "flat"] as const;
    return {
      id: `${domainId}-comp-${i + 1}`,
      domainId,
      host,
      commonKeywords: intBetween(rng, 40, 320),
      keywords: intBetween(rng, 1200, 42000),
      authority: intBetween(rng, 28, 78),
      estTraffic: intBetween(rng, 4000, 190000),
      overlapPct: floatBetween(rng, 8, 62, 1),
      trend: pick(rng, trends as unknown as ("up" | "down" | "flat")[]),
    };
  });
}

/* ------------------------------ Site Audit ------------------------------ */

const ISSUE_LIBRARY: {
  title: string;
  category: string;
  severity: TechnicalIssue["severity"];
  explanation: string;
  fix: string;
  impact: string;
}[] = [
  {
    title: "Pages missing meta descriptions",
    category: "Metadata",
    severity: "medium",
    explanation:
      "Pages without a meta description let search engines auto-generate snippets, reducing CTR control.",
    fix: "Author unique 140–160 character descriptions for affected templates.",
    impact: "Improved organic CTR on money pages.",
  },
  {
    title: "Broken internal links (404)",
    category: "Internal linking",
    severity: "high",
    explanation:
      "Internal links pointing to 404 URLs waste crawl budget and leak link equity.",
    fix: "Update or redirect the broken targets; regenerate the internal link map.",
    impact: "Recovered crawl efficiency and preserved equity flow.",
  },
  {
    title: "Slow Largest Contentful Paint on mobile",
    category: "Core Web Vitals",
    severity: "high",
    explanation:
      "Mobile LCP above 2.5s on key templates harms rankings and user experience.",
    fix: "Compress hero imagery, preload the LCP asset and defer non-critical JS.",
    impact: "Better CWV assessment and mobile ranking stability.",
  },
  {
    title: "Duplicate title tags",
    category: "Metadata",
    severity: "medium",
    explanation: "Multiple pages sharing titles cause cannibalisation and diluted relevance.",
    fix: "Template titles with unique location/intent modifiers.",
    impact: "Reduced cannibalisation across the cluster.",
  },
  {
    title: "Missing hreflang annotations",
    category: "International",
    severity: "medium",
    explanation:
      "Multi-market pages without hreflang risk the wrong regional URL ranking.",
    fix: "Add reciprocal hreflang tags for each market and language variant.",
    impact: "Correct regional targeting and fewer wrong-market impressions.",
  },
  {
    title: "Orphan pages with no internal links",
    category: "Internal linking",
    severity: "medium",
    explanation: "Pages reachable only via sitemap receive little equity and rank poorly.",
    fix: "Add contextual internal links from relevant hub and category pages.",
    impact: "Improved discovery and ranking potential of deep pages.",
  },
  {
    title: "Non-canonical duplicate content",
    category: "Canonicalisation",
    severity: "high",
    explanation:
      "Parameterised URLs indexable without canonical tags create duplicate clusters.",
    fix: "Set self-referencing canonicals and canonical parameters to clean URLs.",
    impact: "Consolidated ranking signals to the preferred URL.",
  },
  {
    title: "Images missing descriptive alt text",
    category: "Accessibility / Images",
    severity: "low",
    explanation: "Missing alt text hurts accessibility and image-search visibility.",
    fix: "Generate descriptive, keyword-aware alt text for content images.",
    impact: "Incremental image-search traffic and accessibility compliance.",
  },
  {
    title: "Redirect chains longer than two hops",
    category: "Redirects",
    severity: "medium",
    explanation: "Multi-hop redirect chains slow crawling and dilute equity.",
    fix: "Flatten chains so each old URL points directly to the final destination.",
    impact: "Faster crawl and fuller equity transfer.",
  },
  {
    title: "Thin content on category pages",
    category: "Content",
    severity: "low",
    explanation: "Category pages under 300 words struggle to rank for head terms.",
    fix: "Add unique supporting copy and internal links to category templates.",
    impact: "Stronger head-term relevance.",
  },
  {
    title: "Missing structured data on key templates",
    category: "Structured data",
    severity: "medium",
    explanation:
      "Absent schema markup forfeits rich-result eligibility on eligible templates.",
    fix: "Add relevant schema (FAQ, Product, Service, BreadcrumbList) and validate.",
    impact: "Rich-result eligibility and higher SERP real estate.",
  },
  {
    title: "HTTP resources on HTTPS pages",
    category: "HTTPS",
    severity: "high",
    explanation: "Mixed content weakens security signals and can block resources.",
    fix: "Serve every asset over HTTPS and add an upgrade-insecure-requests policy.",
    impact: "Restored secure-context guarantees.",
  },
];

function buildTechnicalIssues(domainId: DomainId): TechnicalIssue[] {
  const host = DOMAINS.find((d) => d.id === domainId)!.host;
  return ISSUE_LIBRARY.map((tpl, i) => {
    const rng = rngFor(`${domainId}:issue:${tpl.title}`);
    const affected = intBetween(rng, 2, 240);
    const statuses = ["open", "open", "open", "in_progress", "resolved"] as const;
    return {
      id: `${domainId}-issue-${i + 1}`,
      domainId,
      title: tpl.title,
      category: tpl.category,
      severity: tpl.severity,
      explanation: tpl.explanation,
      affectedPages: affected,
      samplePages: Array.from({ length: Math.min(3, affected) }, (_, j) => {
        const slugRng = rngFor(`${domainId}:issue:${tpl.title}:page:${j}`);
        return `https://${host}/${pick(slugRng, ["services", "guides", "locations", "rates", "blog"])}/page-${intBetween(slugRng, 1, 90)}`;
      }),
      evidence: `Detected on ${affected} URLs during the latest crawl.`,
      recommendedFix: tpl.fix,
      potentialImpact: tpl.impact,
      firstSeen: isoDaysAgo(intBetween(rng, 14, 120)),
      lastSeen: isoDaysAgo(intBetween(rng, 0, 6)),
      status: pick(rng, statuses as unknown as TechnicalIssue["status"][]),
      taskId: null,
    };
  });
}

const HEALTH_WEIGHTS: { category: string; weight: number }[] = [
  { category: "Crawlability", weight: 0.15 },
  { category: "Indexability", weight: 0.15 },
  { category: "Core Web Vitals", weight: 0.15 },
  { category: "Metadata", weight: 0.1 },
  { category: "Internal linking", weight: 0.1 },
  { category: "Canonicalisation", weight: 0.1 },
  { category: "Structured data", weight: 0.08 },
  { category: "HTTPS & security", weight: 0.07 },
  { category: "International", weight: 0.05 },
  { category: "Content quality", weight: 0.05 },
];

function buildHealthBreakdown(domainId: DomainId): HealthBreakdown[] {
  return HEALTH_WEIGHTS.map((w) => {
    const rng = rngFor(`${domainId}:health:${w.category}`);
    return {
      category: w.category,
      weight: w.weight,
      score: intBetween(rng, 62, 99),
      issues: intBetween(rng, 0, 9),
    };
  });
}

export function healthScore(domainId: DomainId): number {
  const bd = buildHealthBreakdown(domainId);
  const total = bd.reduce((s, b) => s + b.weight * b.score, 0);
  return Math.round(total);
}

function buildCrawlRuns(domainId: DomainId): CrawlRun[] {
  const host = DOMAINS.find((d) => d.id === domainId)!.host;
  void host;
  return Array.from({ length: 6 }, (_, i) => {
    const rng = rngFor(`${domainId}:crawl:${i}`);
    const started = isoDaysAgo(i * 7);
    return {
      id: `${domainId}-crawl-${i + 1}`,
      domainId,
      startedAt: started,
      completedAt: started,
      pagesCrawled: intBetween(rng, 320, 4200),
      healthScore: healthScore(domainId) + intBetween(rng, -5, 4),
      newIssues: intBetween(rng, 0, 8),
      resolvedIssues: intBetween(rng, 0, 6),
      status: i === 0 ? "completed" : "completed",
    };
  });
}

/* ------------------------------ Backlinks ------------------------------- */

const BACKLINK_SOURCES = [
  "propertynews.ae",
  "gulfbusiness.com",
  "thenationalnews.com",
  "travelweekly.co.uk",
  "coachtourismnews.com",
  "petjournal.org",
  "expatfinance.blog",
  "reddit.com",
  "medium.com",
  "linkedin.com",
  "quora.com",
  "yellowpages.ae",
  "trustpilot.com",
  "citylife-guide.eu",
  "movingabroad.io",
];

function buildBacklinks(domainId: DomainId): Backlink[] {
  const host = DOMAINS.find((d) => d.id === domainId)!.host;
  return Array.from({ length: 28 }, (_, i) => {
    const rng = rngFor(`${domainId}:bl:${i}`);
    const src = pick(rng, BACKLINK_SOURCES);
    const statuses = ["new", "active", "active", "active", "lost"] as const;
    const status = pick(rng, statuses as unknown as Backlink["status"][]);
    return {
      id: `${domainId}-bl-${i + 1}`,
      domainId,
      sourceDomain: src,
      sourceUrl: `https://${src}/article-${intBetween(rng, 100, 999)}`,
      targetUrl: `https://${host}/${pick(rng, ["", "guides", "rates", "services", "about"])}`,
      anchor: pick(rng, [
        DOMAINS.find((d) => d.id === domainId)!.name,
        "click here",
        "read more",
        "compare rates",
        "learn more",
        host,
      ]),
      authority: intBetween(rng, 12, 91),
      follow: rng() > 0.28,
      firstSeen: isoDaysAgo(intBetween(rng, 0, 180)),
      lastSeen: isoDaysAgo(intBetween(rng, 0, 5)),
      status,
      toxicity: intBetween(rng, 0, 82),
    };
  });
}

function buildReferringDomains(domainId: DomainId): ReferringDomain[] {
  const seen = new Set<string>();
  const out: ReferringDomain[] = [];
  let idx = 0;
  for (const src of BACKLINK_SOURCES) {
    if (seen.has(src)) continue;
    seen.add(src);
    const rng = rngFor(`${domainId}:rd:${src}`);
    out.push({
      id: `${domainId}-rd-${++idx}`,
      domainId,
      host: src,
      authority: intBetween(rng, 14, 90),
      backlinks: intBetween(rng, 1, 34),
      firstSeen: isoDaysAgo(intBetween(rng, 5, 200)),
      follow: rng() > 0.3,
      topicalRelevance: intBetween(rng, 20, 98),
    });
  }
  return out;
}

/* ----------------------------- AI Visibility ---------------------------- */

function buildAiPrompts(domainId: DomainId): AiPrompt[] {
  const platforms = ["chatgpt", "google_ai", "gemini", "perplexity", "claude"] as const;
  const competitors = competitorHostsFor(domainId);
  return aiPromptSeedsFor(domainId).map((p, i) => {
    const rng = rngFor(`${domainId}:ai:${p.prompt}`);
    const cited = rng() > 0.4;
    const sentiments = ["positive", "neutral", "neutral", "negative"] as const;
    const usedPlatforms = platforms.filter(() => rng() > 0.3);
    return {
      id: `${domainId}-ai-${i + 1}`,
      domainId,
      prompt: p.prompt,
      topic: p.topic,
      platforms: usedPlatforms.length ? usedPlatforms : [platforms[0]],
      mentionRate: intBetween(rng, 8, 86),
      citationRate: cited ? intBetween(rng, 10, 70) : intBetween(rng, 0, 12),
      avgPosition: cited ? intBetween(rng, 1, 5) : null,
      sentiment: pick(rng, sentiments as unknown as AiPrompt["sentiment"][]),
      lastChecked: isoDaysAgo(intBetween(rng, 0, 3)),
      competitorsMentioned: competitors.slice(0, intBetween(rng, 0, 3)),
      cited,
      sampleResponse:
        `When asked "${p.prompt}", the assistant ${cited ? "cited" : "did not cite"} ` +
        `${DOMAINS.find((d) => d.id === domainId)!.name}. ` +
        (cited
          ? "The brand appeared among recommended sources alongside competitors."
          : "Competitors were referenced but the brand was absent — a coverage gap."),
    };
  });
}

/* -------------------------- Recommendations ----------------------------- */

function buildRecommendations(domainId: DomainId): Recommendation[] {
  const name = DOMAINS.find((d) => d.id === domainId)!.name;
  const templates = [
    {
      title: `Fix broken internal links to recover crawl budget on ${name}`,
      module: "Site Audit",
      metric: "Crawl efficiency",
      impact: "Recover ~4% wasted crawl budget",
    },
    {
      title: "Target positions 4–10 quick-win keywords with content refresh",
      module: "Rankings",
      metric: "Organic clicks",
      impact: "+8–12% clicks on refreshed pages",
    },
    {
      title: "Close AI-visibility gap on high-intent buying prompts",
      module: "AI Visibility",
      metric: "AI citation rate",
      impact: "+15pp citation rate on money prompts",
    },
    {
      title: "Add FAQ schema to service templates for rich results",
      module: "Site Audit",
      metric: "SERP CTR",
      impact: "Rich-result eligibility on 40+ pages",
    },
    {
      title: "Pursue backlink gap against top organic competitor",
      module: "Backlinks",
      metric: "Referring domains",
      impact: "+6–10 relevant referring domains",
    },
    {
      title: "Resolve mobile LCP regression on primary landing template",
      module: "Site Audit",
      metric: "Core Web Vitals",
      impact: "Restore mobile ranking stability",
    },
  ];
  const confidences = ["high", "medium", "low"] as const;
  const efforts = ["S", "M", "L"] as const;
  const approvals = ["draft", "pending", "approved"] as const;
  return templates.map((t, i) => {
    const rng = rngFor(`${domainId}:rec:${t.title}`);
    return {
      id: `${domainId}-rec-${i + 1}`,
      domainId,
      title: t.title,
      module: t.module,
      priorityScore: intBetween(rng, 45, 96),
      estImpact: t.impact,
      confidence: pick(rng, confidences as unknown as Recommendation["confidence"][]),
      effort: pick(rng, efforts as unknown as Recommendation["effort"][]),
      evidence: `Derived from stored ${t.module} data for ${name}.`,
      relatedMetric: t.metric,
      approval: pick(rng, approvals as unknown as Recommendation["approval"][]),
      taskId: i < 2 ? `${domainId}-task-${i + 1}` : null,
    };
  });
}

function buildTasks(domainId: DomainId): Task[] {
  const recs = buildRecommendations(domainId);
  const owners = ["Amina S.", "David O.", "Priya R.", "Marco B."];
  const statuses = ["approved", "in_progress", "review", "backlog"] as const;
  return recs.slice(0, 4).map((r, i) => {
    const rng = rngFor(`${domainId}:task:${r.id}`);
    const status = pick(rng, statuses as unknown as Task["status"][]);
    return {
      id: `${domainId}-task-${i + 1}`,
      domainId,
      title: r.title,
      status,
      approval: status === "backlog" ? "pending" : "approved",
      owner: pick(rng, owners),
      dueDate: isoDaysAgo(-intBetween(rng, 2, 21)),
      effort: r.effort,
      sourceRecommendationId: r.id,
      beforeMetric: `${r.relatedMetric}: baseline captured`,
      afterMetric: status === "review" ? `${r.relatedMetric}: +9% measured` : null,
    };
  });
}

/* ------------------------------- Content -------------------------------- */

function buildContent(domainId: DomainId): ContentItem[] {
  const host = DOMAINS.find((d) => d.id === domainId)!.host;
  const kws = KEYWORDS[domainId];
  const statuses = ["performing", "decaying", "opportunity", "cannibalising"] as const;
  return kws.slice(0, 14).map((k, i) => {
    const rng = rngFor(`${domainId}:content:${k.id}`);
    const status = pick(rng, statuses as unknown as ContentItem["status"][]);
    return {
      id: `${domainId}-content-${i + 1}`,
      domainId,
      url: `https://${host}/${k.keyword.replace(/\s+/g, "-")}`,
      title: k.keyword.replace(/\b\w/g, (c) => c.toUpperCase()),
      status,
      clicks: intBetween(rng, 20, 4200),
      clicksDeltaPct: floatBetween(rng, -42, 38, 1),
      impressions: intBetween(rng, 400, 92000),
      avgPosition: floatBetween(rng, 1.2, 34, 1),
      words: intBetween(rng, 280, 2600),
      lastUpdated: isoDaysAgo(intBetween(rng, 5, 320)),
      primaryKeyword: k.keyword,
      opportunity:
        status === "decaying"
          ? "Refresh and re-optimise — organic clicks declining"
          : status === "opportunity"
            ? "Expand coverage — ranking just off page one"
            : status === "cannibalising"
              ? "Consolidate competing URLs targeting the same term"
              : "Maintain — performing to plan",
    };
  });
}

/* -------------------------- Reports & schedules ------------------------- */

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "tpl-exec",
    name: "Portfolio Executive Report",
    type: "Executive",
    description: "Cross-domain KPIs, wins/losses and priority actions for leadership.",
    sections: ["Portfolio KPIs", "Visibility trend", "Winners & losers", "Priority actions"],
  },
  {
    id: "tpl-domain",
    name: "Domain SEO Report",
    type: "Domain",
    description: "Full single-domain performance overview.",
    sections: ["Overview", "Rankings", "Traffic", "Technical", "Recommendations"],
  },
  {
    id: "tpl-rank",
    name: "Ranking Report",
    type: "Rankings",
    description: "Position tracking, visibility and share of voice.",
    sections: ["Position distribution", "Visibility", "Winners & losers", "SERP features"],
  },
  {
    id: "tpl-tech",
    name: "Technical Audit Report",
    type: "Site Audit",
    description: "Health score, issues by severity and remediation plan.",
    sections: ["Health score", "Issues by category", "Affected pages", "Fix plan"],
  },
  {
    id: "tpl-backlink",
    name: "Backlink Report",
    type: "Backlinks",
    description: "Link growth, referring domains, anchors and risk.",
    sections: ["Overview", "New & lost", "Referring domains", "Risk review"],
  },
  {
    id: "tpl-ai",
    name: "AI Visibility Report",
    type: "AI Visibility",
    description: "Brand mention and citation performance across AI platforms.",
    sections: ["Mention rate", "Citation rate", "Competitor SoV", "Missed prompts"],
  },
];

function buildSchedules(): ReportSchedule[] {
  const rng = rngFor("schedules");
  const schedules: ReportSchedule[] = [
    {
      id: "sch-1",
      domainId: "portfolio",
      templateId: "tpl-exec",
      templateName: "Portfolio Executive Report",
      cadence: "monthly",
      nextRun: isoDaysAgo(-6),
      recipients: ["leadership@orwell.io", "seo-lead@orwell.io"],
      lastDelivered: isoDaysAgo(24),
      format: "PDF",
    },
    {
      id: "sch-2",
      domainId: "mortgagecompare",
      templateId: "tpl-domain",
      templateName: "Domain SEO Report",
      cadence: "weekly",
      nextRun: isoDaysAgo(-3),
      recipients: ["mortgage-team@orwell.io"],
      lastDelivered: isoDaysAgo(4),
      format: "PDF+CSV",
    },
    {
      id: "sch-3",
      domainId: "busrentalglobal",
      templateId: "tpl-rank",
      templateName: "Ranking Report",
      cadence: "weekly",
      nextRun: isoDaysAgo(-2),
      recipients: ["bus-team@orwell.io"],
      lastDelivered: isoDaysAgo(5),
      format: "CSV",
    },
    {
      id: "sch-4",
      domainId: "pettransportglobal",
      templateId: "tpl-tech",
      templateName: "Technical Audit Report",
      cadence: "monthly",
      nextRun: isoDaysAgo(-12),
      recipients: ["pet-team@orwell.io"],
      lastDelivered: isoDaysAgo(18),
      format: "PDF",
    },
  ];
  void rng;
  return schedules;
}

/* ------------------------------ Cost & usage ---------------------------- */

function buildUsageLedger(): UsageLedgerEntry[] {
  const out: UsageLedgerEntry[] = [];
  const modules = [
    "Keyword research",
    "Rank tracking",
    "Site audit",
    "Backlinks",
    "AI visibility",
  ];
  let id = 0;
  for (let day = 29; day >= 0; day--) {
    const rng = rngFor(`usage:${day}`);
    const m = pick(rng, modules);
    const dom = pick(rng, DOMAINS).id;
    out.push({
      id: `usage-${++id}`,
      date: isoDaysAgo(day),
      provider: "demo",
      module: m,
      requests: intBetween(rng, 0, 40),
      cost: 0, // zero actual spend in demo mode
      domainId: dom,
    });
  }
  return out;
}

export const PROVIDER_CONNECTIONS: ProviderConnection[] = [
  {
    id: "conn-dfs",
    provider: "dataforseo",
    label: "DataForSEO",
    connected: false,
    lastSync: null,
    status: "disconnected",
    detail: "Keyword, SERP, backlink, on-page and AI-mention data. Awaiting credentials.",
  },
  {
    id: "conn-gsc",
    provider: "google-search-console",
    label: "Google Search Console",
    connected: false,
    lastSync: null,
    status: "disconnected",
    detail: "First-party clicks, impressions, CTR and position. Awaiting OAuth connection.",
  },
  {
    id: "conn-ga4",
    provider: "google-analytics",
    label: "Google Analytics 4",
    connected: false,
    lastSync: null,
    status: "disconnected",
    detail: "Organic sessions, conversions and landing-page performance. Awaiting OAuth.",
  },
];

/* -------------------------------- Alerts -------------------------------- */

function buildAlerts(): AlertItem[] {
  return [
    {
      id: "alert-1",
      domainId: "mortgagecompare",
      severity: "high",
      title: "Ranking gain: ‘uae mortgage calculator’ entered top 3",
      detail: "Moved from position 7 to 2 on desktop over the last 7 days.",
      createdAt: isoDaysAgo(1),
      module: "Rankings",
      read: false,
    },
    {
      id: "alert-2",
      domainId: "busrentalglobal",
      severity: "critical",
      title: "Visibility drop detected",
      detail: "Portfolio share of voice for BusRentalGlobal fell 6% over 14 days.",
      createdAt: isoDaysAgo(2),
      module: "Rankings",
      read: false,
    },
    {
      id: "alert-3",
      domainId: "pettransportglobal",
      severity: "medium",
      title: "New referring domain acquired",
      detail: "petjournal.org linked to your international shipping guide.",
      createdAt: isoDaysAgo(0),
      module: "Backlinks",
      read: false,
    },
    {
      id: "alert-4",
      domainId: "mortgagecompare",
      severity: "high",
      title: "Technical: mobile LCP regression",
      detail: "Largest Contentful Paint exceeded 2.5s on the rates template.",
      createdAt: isoDaysAgo(3),
      module: "Site Audit",
      read: true,
    },
    {
      id: "alert-5",
      domainId: "portfolio",
      severity: "low",
      title: "Monthly budget at 0% — demo mode",
      detail: "No live provider spend recorded. $200 guardrail active.",
      createdAt: isoDaysAgo(1),
      module: "Settings",
      read: true,
    },
  ];
}

/* ------------------------------ Provenance ------------------------------ */

export function provenanceFor(
  domainId: DomainId,
  source: Provenance["source"] = "demo",
  device: Provenance["device"] = "desktop",
): Provenance {
  return {
    source,
    collectedAt: isoDaysAgo(0) + "T06:00:00.000Z",
    rangeStart: isoDaysAgo(90),
    rangeEnd: isoDaysAgo(0),
    location: locationFor(domainId),
    device,
    freshness: "fresh",
    mode: "demo",
  };
}

/* ----------------------------- Assembled DB ----------------------------- */

export const SEED = {
  keywords: KEYWORDS,
  keywordLists: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildKeywordLists(d.id)]),
  ) as Record<DomainId, KeywordList[]>,
  rankSnapshots: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildRankSnapshots(d.id)]),
  ) as Record<DomainId, RankSnapshot[]>,
  positionBuckets: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildPositionBuckets(d.id)]),
  ) as Record<DomainId, PositionBucket[]>,
  visibility: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildVisibilitySeries(d.id)]),
  ) as Record<DomainId, { date: string; value: number }[]>,
  competitors: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildCompetitors(d.id)]),
  ) as Record<DomainId, Competitor[]>,
  technicalIssues: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildTechnicalIssues(d.id)]),
  ) as Record<DomainId, TechnicalIssue[]>,
  healthBreakdown: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildHealthBreakdown(d.id)]),
  ) as Record<DomainId, HealthBreakdown[]>,
  crawlRuns: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildCrawlRuns(d.id)]),
  ) as Record<DomainId, CrawlRun[]>,
  backlinks: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildBacklinks(d.id)]),
  ) as Record<DomainId, Backlink[]>,
  referringDomains: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildReferringDomains(d.id)]),
  ) as Record<DomainId, ReferringDomain[]>,
  aiPrompts: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildAiPrompts(d.id)]),
  ) as Record<DomainId, AiPrompt[]>,
  recommendations: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildRecommendations(d.id)]),
  ) as Record<DomainId, Recommendation[]>,
  tasks: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildTasks(d.id)]),
  ) as Record<DomainId, Task[]>,
  content: Object.fromEntries(
    DOMAINS.map((d) => [d.id, buildContent(d.id)]),
  ) as Record<DomainId, ContentItem[]>,
  reportTemplates: REPORT_TEMPLATES,
  schedules: buildSchedules(),
  usageLedger: buildUsageLedger(),
  providerConnections: PROVIDER_CONNECTIONS,
  alerts: buildAlerts(),
};
