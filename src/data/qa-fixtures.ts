import type { DomainLiveBundle, PortfolioLive } from "@/lib/live";
import type { ManagedSite, PortfolioGroup } from "@/platform/types";
import { DEFAULT_ALERT_CHANNELS } from "@/platform/notification-defaults";

const COLORS = ["#335CFF", "#12B8C4", "#FF6B5E", "#F2B544", "#16A879"];
export const QA_GROUPS: PortfolioGroup[] = [
  { id: "10000000-0000-4000-8000-000000000001", slug: "finance", name: "Finance", description: "Synthetic staging group", color: "#335CFF", parentId: null, sortOrder: 0, siteSlugs: [] },
  { id: "10000000-0000-4000-8000-000000000002", slug: "uae", name: "UAE", description: "Nested market group", color: "#12B8C4", parentId: "10000000-0000-4000-8000-000000000001", sortOrder: 0, siteSlugs: [] },
  { id: "10000000-0000-4000-8000-000000000003", slug: "growth", name: "Growth portfolio", description: "Cross-group operational view", color: "#FF6B5E", parentId: null, sortOrder: 1, siteSlugs: [] },
  { id: "10000000-0000-4000-8000-000000000004", slug: "launches", name: "Launches", description: "Pre-launch and recently launched sites", color: "#F2B544", parentId: "10000000-0000-4000-8000-000000000003", sortOrder: 0, siteSlugs: [] },
];

export const QA_SITES: ManagedSite[] = Array.from({ length: 20 }, (_, index) => {
  const mortgage = index === 0;
  const id = mortgage ? "mortgagecompare" : `qa-site-${String(index + 1).padStart(2, "0")}`;
  const host = mortgage ? "mortgagecompare.ae" : `site-${index + 1}.example.test`;
  return {
    id, name: mortgage ? "MortgageCompare" : `QA Website ${String(index + 1).padStart(2, "0")}`, host,
    accent: COLORS[index % COLORS.length]!, industry: mortgage ? "UAE mortgage comparison" : "Synthetic QA business",
    primaryMarket: index % 2 ? "United Kingdom" : "United Arab Emirates",
    gscSite: mortgage ? "sc-domain:mortgagecompare.ae" : `sc-domain:${host}`,
    ga4PropertyId: mortgage ? "529950642" : `90000${index}`,
    dataForSeoLocationCode: index % 2 ? 2826 : 2784, dataForSeoLanguageCode: "en",
    devices: index % 3 ? ["desktop", "mobile"] : ["mobile"],
    lifecycleStatus: index === 18 ? "paused" : index === 19 ? "pre_launch" : "active",
    spendApproval: index % 4 === 0 ? "pending" : "approved",
    forecastMonthlyUsd: 3.2 + index * 0.18, approvedMonthlyUsd: index % 4 === 0 ? null : 10,
    budgetLimits: { rankings: 2, crawling: 2, backlinks: 2, competitors: 1, ai: 2, local_seo: 1 },
    forecast: null, crawlMaxPages: 10000, backlinkLimit: 10000,
    monitoringSchedule: { rankings: "daily", crawling: "monthly", backlinks: "weekly", competitors: "weekly", ai: "weekly", localSeo: "weekly", reliability: "hourly" },
    siteSettings: { trackedKeywords: ["best service", "compare providers"], competitors: ["example-competitor.com"], priorityTopics: ["Comparison"], localGridSize: "3x3", localRadiusKm: 5 },
    archivedAt: null, source: "database", createdAt: "2026-08-01T08:00:00.000Z", updatedAt: "2026-08-26T08:00:00.000Z",
  };
});

for (let index = 0; index < QA_SITES.length; index++) {
  const group = index < 10 ? (index < 6 ? QA_GROUPS[1]! : QA_GROUPS[0]!) : (index < 16 ? QA_GROUPS[2]! : QA_GROUPS[3]!);
  group.siteSlugs.push(QA_SITES[index]!.id);
  if (index % 5 === 0) QA_GROUPS[2]!.siteSlugs.push(QA_SITES[index]!.id);
}

function headline(site: ManagedSite, index: number) {
  const health = 96 - (index * 7 % 37);
  return {
    domainId: site.id, lastSync: `2026-08-26T08:${String(index).padStart(2, "0")}:00.000Z`,
    clicks28d: 840 + index * 117, impressions28d: 18400 + index * 930, avgPosition: 8.4 + index * 0.21,
    sessions28d: 1100 + index * 91, conversions28d: 18 + index * 2, visibility: 42 + index * 2,
    health, authority: 48 + index, keywordsTracked: 12, top10: 9, referringDomains: 8 + index,
    criticalIssues: index % 6 === 0 ? 2 : index % 4 === 0 ? 1 : 0, aiMentionRate: 45 + index, ga4Mapped: true,
  };
}

export function qaPortfolio(siteSlugs?: string[]): PortfolioLive {
  const allowed = siteSlugs ? new Set(siteSlugs) : null;
  const sites = allowed ? QA_SITES.filter((site) => allowed.has(site.id)) : QA_SITES;
  const domains = sites.map((site) => headline(site, QA_SITES.indexOf(site)));
  return {
    generatedAt: new Date().toISOString(), domains,
    totals: {
      clicks28d: domains.reduce((sum, item) => sum + (item.clicks28d ?? 0), 0),
      impressions28d: domains.reduce((sum, item) => sum + (item.impressions28d ?? 0), 0),
      sessions28d: domains.reduce((sum, item) => sum + (item.sessions28d ?? 0), 0),
      conversions28d: domains.reduce((sum, item) => sum + (item.conversions28d ?? 0), 0),
      avgHealth: Math.round(domains.reduce((sum, item) => sum + (item.health ?? 0), 0) / Math.max(domains.length, 1)),
      avgVisibility: Math.round(domains.reduce((sum, item) => sum + (item.visibility ?? 0), 0) / Math.max(domains.length, 1)),
      criticalIssues: domains.reduce((sum, item) => sum + (item.criticalIssues ?? 0), 0),
      referringDomains: domains.reduce((sum, item) => sum + (item.referringDomains ?? 0), 0),
      domainsSynced: domains.length,
    },
  };
}

export function qaDomainBundle(siteSlug: string): DomainLiveBundle {
  const site = QA_SITES.find((item) => item.id === siteSlug) ?? QA_SITES[0]!;
  const index = QA_SITES.indexOf(site);
  const h = headline(site, index);
  const date = "2026-08-26";
  const provenance = { source: "demo", collectedAt: h.lastSync!, rangeStart: "2026-07-30", rangeEnd: date, location: site.primaryMarket, device: "desktop", freshness: "fresh", mode: "demo" };
  const ds = <T>(data: T) => ({ data, capturedOn: date, provenance });
  const critical = h.criticalIssues ?? 0;
  return {
    domainId: siteSlug, lastSync: h.lastSync,
    datasets: {
      gsc_totals: ds({ clicks: h.clicks28d!, impressions: h.impressions28d!, ctr: 4.8, position: h.avgPosition! }),
      ga4_overview: ds({ sessions: h.sessions28d!, totalUsers: 940, newUsers: 680, engagedSessions: 720, engagementRate: 61.2, conversions: h.conversions28d!, screenPageViews: 1900 }),
      gsc_timeseries: ds(Array.from({ length: 28 }, (_, day) => ({ date: `2026-08-${String(day + 1).padStart(2, "0")}`, clicks: 22 + index * 2 + day, impressions: 480 + index * 15 + day * 6, ctr: 4.8, position: h.avgPosition! }))),
      onpage: ds({ healthScore: h.health!, breakdown: [{ category: "Indexability", weight: 0.3, score: h.health!, issues: critical }], crawlRun: { id: `qa-crawl-${index}`, domainId: site.id, startedAt: h.lastSync!, completedAt: h.lastSync!, pagesCrawled: 420 + index * 23, healthScore: h.health!, newIssues: critical, resolvedIssues: index % 3, status: "completed" }, issues: Array.from({ length: critical }, (_, issue) => ({ id: `qa-issue-${index}-${issue}`, domainId: site.id, title: issue ? "Canonical conflict" : "Blocked indexable page", category: "Indexability", severity: issue ? "high" : "critical", explanation: "Synthetic QA evidence", affectedPages: 2 + issue, samplePages: [`https://${site.host}/sample-${issue}`], evidence: "Synthetic staging signal", recommendedFix: "Review the affected template.", potentialImpact: "Search visibility", firstSeen: date, lastSeen: date, status: "open", taskId: null })) }),
      visibility_series: ds(Array.from({ length: 14 }, (_, day) => ({ date: `2026-08-${String(day + 13).padStart(2, "0")}`, value: 40 + index + day * 0.6 }))),
      position_buckets: ds([{ label: "1-3", count: 2, prevCount: 1 }, { label: "4-10", count: 7, prevCount: 6 }, { label: "11-20", count: 3, prevCount: 5 }]),
      keywords: ds(Array.from({ length: 12 }, (_, keyword) => ({
        id: `${site.id}-kw-${keyword}`,
        domainId: site.id,
        keyword: `sample keyword ${keyword + 1}`,
        location: site.primaryMarket,
        intent: keyword % 2 ? "commercial" : "informational",
        volume: 900 - keyword * 35,
        difficulty: 30 + keyword,
        cpc: 1.2 + keyword * 0.08,
        competition: 0.45 + keyword * 0.02,
        position: 2 + keyword,
        prevPosition: 3 + keyword,
        competitorPositions: { "competitor.example": 1 + keyword },
        trafficPotential: 520 - keyword * 22,
        serpFeatures: keyword % 3 === 0 ? ["people_also_ask"] : [],
        trend: Array.from({ length: 12 }, (_, month) => 62 + keyword + month * 2),
        targetUrl: `https://${site.host}/page-${keyword}`,
      }))),
      rank_snapshots: ds(Array.from({ length: 12 }, (_, keyword) => ({ keywordId: `${site.id}-kw-${keyword}`, keyword: `sample keyword ${keyword + 1}`, date, position: 2 + keyword, prevPosition: 3 + keyword, device: "desktop", location: site.primaryMarket, url: `https://${site.host}/page-${keyword}`, volume: 900 - keyword * 35, serpFeatures: [], tags: ["qa"] }))),
      gsc_queries: ds(Array.from({ length: 12 }, (_, query) => ({ key: `search query ${query + 1}`, clicks: 94 - query * 4, impressions: 1600 - query * 55, ctr: 5.8 - query * 0.12, position: 4.2 + query * 0.7 }))),
      gsc_pages: ds(Array.from({ length: 8 }, (_, page) => ({ key: `https://${site.host}/page-${page + 1}`, clicks: 210 - page * 18, impressions: 3600 - page * 170, ctr: 5.8 - page * 0.2, position: 3.8 + page }))),
      gsc_movers: ds({
        gains: [{ key: "mortgage comparison", clicksBefore: 42, clicksNow: 69, change: 27 }],
        losses: [{ key: "best mortgage rates", clicksBefore: 51, clicksNow: 39, change: -12 }],
      }),
      striking_distance: ds(Array.from({ length: 5 }, (_, opportunity) => ({ query: `page one opportunity ${opportunity + 1}`, position: 7.8 + opportunity * 1.4, impressions: 940 - opportunity * 90, clicks: 31 - opportunity * 3 }))),
      keyword_gaps: ds(Array.from({ length: 6 }, (_, gap) => ({ keyword: `competitor gap ${gap + 1}`, competitorHost: "competitor.example", competitorPosition: 2 + gap, sitePosition: gap % 2 ? 18 + gap : null, volume: 1200 - gap * 110, difficulty: 38 + gap * 3, intent: gap % 2 ? "commercial" : "informational", trafficPotential: 420 - gap * 30 }))),
      competitors: ds([{ id: `${site.id}-comp-1`, domainId: site.id, host: "competitor.example", commonKeywords: 84, keywords: 1240, authority: 62, estTraffic: 12400, overlapPct: 37, trend: "up" }]),
      backlinks: ds(Array.from({ length: 10 }, (_, link) => ({ id: `${site.id}-bl-${link}`, domainId: site.id, sourceDomain: `publisher-${link}.example`, sourceUrl: `https://publisher-${link}.example/story`, targetUrl: `https://${site.host}/`, anchor: site.name, authority: 45 + link, follow: link % 3 !== 0, firstSeen: date, lastSeen: date, status: "active", toxicity: link }))),
      referring_domains: ds(Array.from({ length: 8 + index }, (_, ref) => ({ id: `${site.id}-rd-${ref}`, domainId: site.id, host: `publisher-${ref}.example`, authority: 40 + ref, backlinks: 1 + ref % 3, firstSeen: date, follow: ref % 3 !== 0 }))),
      recommendations: ds([{ id: `${site.id}-rec-1`, domainId: site.id, title: "Resolve high-impact indexability change", module: "Technical", priorityScore: 86 - index, estImpact: "Protect organic traffic", confidence: "high", effort: "S", evidence: "Synthetic QA recommendation", relatedMetric: "Health score" }]),
      ga4_landing_pages: ds(Array.from({ length: 6 }, (_, page) => ({ landingPage: `/landing-${page + 1}`, sessions: 320 - page * 28, totalUsers: 260 - page * 22, conversions: 12 - page, engagementRate: 62 - page * 1.4 }))),
      share_of_market: ds({
        site: site.host,
        windowDays: 28,
        measuredClicks: h.clicks28d!,
        measuredImpressions: h.impressions28d!,
        keywordCount: 12,
        monthlySearchVolume: 48_000 + index * 900,
        availableMonthlyClicks: 15_000 + index * 280,
        availableClicksInWindow: 13_800 + index * 260,
        shareOfAvailableClicksPct: Number(((h.clicks28d! / (13_800 + index * 260)) * 100).toFixed(1)),
        impressionShareOfDemandPct: Number(((h.impressions28d! / (48_000 + index * 900)) * 100).toFixed(1)),
        baselined: date,
      }),
    },
  } as unknown as DomainLiveBundle;
}

export function qaSettings(siteSlug: string) {
  const site = QA_SITES.find((item) => item.id === siteSlug) ?? QA_SITES[0]!;
  return {
    site: {
      slug: site.id, name: site.name, host: site.host, accent: site.accent, industry: site.industry,
      primaryMarket: site.primaryMarket, locationCode: site.dataForSeoLocationCode, languageCode: site.dataForSeoLanguageCode,
      devices: site.devices, gscProperty: site.gscSite || null, ga4Property: site.ga4PropertyId,
      lifecycleStatus: site.lifecycleStatus, spendApproval: site.spendApproval, forecastMonthlyUsd: site.forecastMonthlyUsd,
      approvedMonthlyUsd: site.approvedMonthlyUsd, budgetLimits: site.budgetLimits, monitoringSchedule: site.monitoringSchedule,
      siteSettings: site.siteSettings, crawlMaxPages: site.crawlMaxPages, backlinkLimit: site.backlinkLimit,
    },
    connections: site.id === "mortgagecompare" ? [{ id: "qa-github", kind: "github", status: "connected", displayName: "SEOcommand", remoteUrl: "https://github.com/orwellhub/SEOcommand", config: { publishMode: "review_only" }, lastCheckedAt: "2026-08-26T08:00:00.000Z" }] : [],
    groupIds: QA_GROUPS.filter((group) => group.siteSlugs.includes(site.id)).map((group) => group.id),
    groups: QA_GROUPS, notificationRule: { channels: [...DEFAULT_ALERT_CHANNELS], recipients: ["email:qa@example.test"], eventTypes: ["rank_drop", "technical_regression", "site_unavailable"], rankDropThreshold: 5, trafficDropPct: 20, enabled: true },
    spend: { month: "2026-08", totalUsd: site.id === "mortgagecompare" ? 2.46 : 0.84, lines: [] },
    auditEvents: [{ id: "qa-audit", actorEmail: "qa@orwell.local", actorRole: "admin", action: "updated", area: "budget", summary: "Approved synthetic QA budget.", createdAt: "2026-08-26T08:00:00.000Z" }],
    credentialPolicy: "Synthetic QA: central connector mappings only; no credentials or provider calls are present.",
  };
}

export function qaKeywordStrategy(siteSlug: string) {
  const site = QA_SITES.find((item) => item.id === siteSlug) ?? QA_SITES[0]!;
  const clusters = [
    { id: "qa-cluster-1", label: "Mortgage comparison", intent: "commercial", keywords: ["compare mortgages", "best mortgage rates", "mortgage comparison"], totalVolume: 6400, avgDifficulty: 48, bestPosition: 6, targetUrl: `https://${site.host}/mortgages`, opportunityScore: 82 },
    { id: "qa-cluster-2", label: "First-time buyers", intent: "informational", keywords: ["first time buyer mortgage", "mortgage deposit guide"], totalVolume: 4100, avgDifficulty: 41, bestPosition: 12, targetUrl: `https://${site.host}/first-time-buyers`, opportunityScore: 74 },
    { id: "qa-cluster-3", label: "Mortgage calculators", intent: "transactional", keywords: ["mortgage calculator", "monthly payment calculator"], totalVolume: 8200, avgDifficulty: 55, bestPosition: null, targetUrl: null, opportunityScore: 91 },
  ];
  return {
    capturedOn: "2026-08-26",
    clusters,
    pageMap: clusters.filter((item) => item.targetUrl).map((item, index) => ({ page: item.targetUrl!, primaryQuery: item.keywords[0]!, queries: item.keywords, clicks: 420 - index * 90, impressions: 7200 - index * 900, averagePosition: item.bestPosition ?? 20 })),
    cannibalisation: [{ query: "mortgage rates uae", pages: [{ page: `https://${site.host}/rates`, clicks: 81, impressions: 1600, position: 8.2 }, { page: `https://${site.host}/mortgages/rates`, clicks: 54, impressions: 1180, position: 10.6 }], totalImpressions: 2780, severity: "high" }],
    summary: { clusters: clusters.length, mappedPages: 2, unmappedClusters: 1, cannibalisationIssues: 1, highOpportunityClusters: 2 },
  };
}

export function qaBrowserCrawl(siteSlug: string) {
  const site = QA_SITES.find((item) => item.id === siteSlug) ?? QA_SITES[0]!;
  const pages = Array.from({ length: 14 }, (_, index) => ({
    id: `qa-page-${index + 1}`, url: `https://${site.host}/${index ? `page-${index}` : ""}`, finalUrl: null,
    statusCode: index === 11 ? 404 : 200, depth: Math.min(3, Math.floor(index / 4)), renderedTitle: index === 3 ? null : `${site.name} page ${index + 1}`,
    canonical: `https://${site.host}/${index ? `page-${index}` : ""}`, h1Count: index === 4 ? 2 : 1, wordCount: 620 + index * 37,
    jsDependent: index === 5 || index === 9, indexable: index !== 11, schemaTypes: index % 3 === 0 ? ["WebPage", "FAQPage"] : ["WebPage"], hreflang: { en: `https://${site.host}/${index ? `page-${index}` : ""}` },
    internalLinks: 14 + index, externalLinks: index % 4, loadTimeMs: 430 + index * 42,
    issues: index === 3 ? ["missing_title"] : index === 4 ? ["multiple_h1"] : index === 5 ? ["javascript_dependent_content"] : index === 11 ? ["client_error"] : [],
  }));
  return {
    run: { id: "20000000-0000-4000-8000-000000000001", status: "completed", maxPages: 200, pagesCrawled: pages.length, issueCounts: { missing_title: 1, multiple_h1: 1, javascript_dependent_content: 2, client_error: 1 }, diffSummary: { added: 2, removed: 1, contentChanged: 4, titleChanged: 1, canonicalChanged: 0, indexabilityChanged: 1 }, startedAt: "2026-08-26T07:40:00.000Z", completedAt: "2026-08-26T07:43:00.000Z", lastError: null },
    pages,
    orphanUrls: [`https://${site.host}/orphan-candidate`],
  };
}

function qaScopedSites(scope: string) {
  if (scope === "portfolio") return QA_SITES;
  if (scope.startsWith("group:")) {
    const group = QA_GROUPS.find((item) => item.id === scope.slice(6));
    return QA_SITES.filter((site) => group?.siteSlugs.includes(site.id));
  }
  return QA_SITES.filter((site) => site.id === scope);
}

export function qaReliability(scope: string) {
  const sites = qaScopedSites(scope);
  const latest = sites.map((site, index) => ({ id: `qa-check-${site.id}`, siteSlug: site.id, checkedAt: `2026-08-26T08:${String(index).padStart(2, "0")}:00.000Z`, available: index !== 7, statusCode: index === 7 ? 503 : 200, responseTimeMs: 182 + index * 23, tlsValid: index !== 12, tlsExpiresAt: "2026-12-15T00:00:00.000Z", domainExpiresAt: "2027-05-20T00:00:00.000Z", robotsStatus: 200, sitemapStatus: index === 9 ? 404 : 200 }));
  const checks = latest.flatMap((row, index) => Array.from({ length: 12 }, (_, sample) => ({ ...row, id: `${row.id}-${sample}`, checkedAt: `2026-08-${String(26 - Math.floor(sample / 3)).padStart(2, "0")}T${String(8 - sample % 3).padStart(2, "0")}:00:00.000Z`, responseTimeMs: (row.responseTimeMs ?? 200) + sample * 4 - index })));
  return { summary: { monitored: sites.length, available: latest.filter((item) => item.available).length, incidents: latest.filter((item) => !item.available || item.tlsValid === false).length, avgResponseMs: latest.length ? Math.round(latest.reduce((sum, item) => sum + (item.responseTimeMs ?? 0), 0) / latest.length) : null, uptimePct: 99.82 }, latest, checks };
}

export function qaLinkBuilding(siteSlug: string) {
  const prospects = Array.from({ length: 7 }, (_, index) => ({ id: `30000000-0000-4000-8000-00000000000${index + 1}`, sourceDomain: `publisher-${index + 1}.example`, sourceUrl: `https://publisher-${index + 1}.example/mortgage-guide`, authority: 72 - index * 3, relevance: 91 - index * 5, reason: `Links to two competitors but not ${siteSlug}; topical guide matches the site's comparison content.`, competitorHosts: ["competitor.example", "market-leader.example"], contacts: index < 2 ? [{ type: "email", value: `editor${index + 1}@publisher-${index + 1}.example` }] : [], status: index === 6 ? "dismissed" : "new" }));
  const drafts = [{ id: "31000000-0000-4000-8000-000000000001", prospectId: prospects[0]!.id, recipientEmail: "editor1@publisher-1.example", subject: "A current UAE mortgage comparison resource", body: "Synthetic QA outreach draft. Nothing is sent from staging.", status: "draft", approvedBy: null, approvedAt: null, sentAt: null }, { id: "31000000-0000-4000-8000-000000000002", prospectId: prospects[1]!.id, recipientEmail: "editor2@publisher-2.example", subject: "Additional data for your mortgage guide", body: "Synthetic QA approved message. Delivery remains disabled in staging.", status: "approved", approvedBy: "qa@orwell.local", approvedAt: "2026-08-25T10:00:00.000Z", sentAt: null }];
  return { summary: { prospects: prospects.length, strongProspects: prospects.filter((item) => item.relevance >= 70).length, awaitingApproval: drafts.filter((item) => item.status === "draft").length, sent: 0 }, prospects, drafts };
}

export function qaCompetitorExplorer(targetHost = "competitor.example") {
  return { targetHost, capturedAt: "2026-08-26T08:00:00.000Z", overview: { organicKeywords: 18420, organicTraffic: 72100, paidKeywords: 212, paidTraffic: 4100, estimatedTrafficCost: 88600 }, keywords: Array.from({ length: 12 }, (_, index) => ({ keyword: `competitor keyword ${index + 1}`, position: 1 + index, volume: 6200 - index * 310, difficulty: 43 + index, intent: index % 2 ? "commercial" : "informational", url: `https://${targetHost}/page-${index + 1}`, traffic: 940 - index * 52 })), pages: Array.from({ length: 7 }, (_, index) => ({ url: `https://${targetHost}/top-page-${index + 1}`, keywords: 960 - index * 90, traffic: 8400 - index * 680, trafficCost: 11200 - index * 800 })), backlinks: { rank: 67, backlinks: 28400, referringDomains: 2140, spamScore: 3 } };
}

export function qaLocalSeo(scope: string) {
  const sites = qaScopedSites(scope);
  const locations = sites.slice(0, Math.min(3, sites.length)).map((site, index) => ({ id: `40000000-0000-4000-8000-00000000000${index + 1}`, siteSlug: site.id, name: index ? `${site.name} local profile` : "MortgageCompare Dubai", businessKeyword: index ? "local comparison service" : "mortgage broker comparison dubai", address: index ? "Central business district" : "Dubai, United Arab Emirates", gridSize: index === 1 ? 5 : 3, gridRadiusKm: 5, keywords: index ? ["comparison service near me"] : ["mortgage broker dubai", "compare mortgages dubai"], active: true, approval: "approved", estimatedMonthlyUsd: index === 1 ? 1.42 : 0.64 }));
  const snapshots = locations.map((location, index) => ({ id: `qa-local-snapshot-${index}`, locationId: location.id, capturedOn: "2026-08-26", rating: 4.7 - index * 0.1, reviewCount: 186 + index * 41, profileCompleteness: 92 - index * 4, matched: true }));
  const grid = locations.flatMap((location, locationIndex) => location.keywords.flatMap((keyword) => Array.from({ length: location.gridSize ** 2 }, (_, point) => ({ id: `qa-grid-${locationIndex}-${keyword}-${point}`, locationId: location.id, keyword, capturedOn: "2026-08-26", latitude: 25.2048 + (Math.floor(point / location.gridSize) - 1) * 0.006, longitude: 55.2708 + (point % location.gridSize - 1) * 0.006, position: 2 + (point + locationIndex) % 9, matched: true }))));
  return { locations, snapshots, grid };
}

export function qaAiVisibility(scope: string) {
  const sites = qaScopedSites(scope);
  const measuredSites = sites.length ? sites : [QA_SITES[0]!];
  const platforms = ["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"];
  const observations = platforms.flatMap((platform, index) => measuredSites.slice(0, Math.min(2, measuredSites.length)).map((site, siteIndex) => ({ id: `qa-ai-${platform}-${site.id}`, siteSlug: site.id, siteName: site.name, promptId: null, prompt: siteIndex ? "Which comparison sites provide transparent costs?" : "What is the best way to compare UAE mortgage rates?", topic: "Mortgage comparison", platform, responseText: `${site.name} is included in this synthetic QA response with transparent comparison guidance.`, rawResponse: {}, mentioned: index !== 5, cited: index % 3 !== 1, recommendationPosition: index % 3 + 1, sentiment: index === 4 ? "neutral" : "positive", confidence: 0.91, responseHash: `qa-${index}-${siteIndex}`, fanOutQueries: ["mortgage comparison fees", "UAE mortgage eligibility"], costUsd: 0, providerMetadata: { synthetic: true }, capturedOn: `2026-08-${String(26 - index).padStart(2, "0")}`, capturedAt: `2026-08-${String(26 - index).padStart(2, "0")}T08:00:00.000Z`, createdAt: `2026-08-${String(26 - index).padStart(2, "0")}T08:00:00.000Z`, citations: index % 3 !== 1 ? [{ id: `qa-citation-${index}-${siteIndex}`, observationId: `qa-ai-${platform}-${site.id}`, url: `https://${site.host}/mortgages`, domain: site.host, title: `${site.name} mortgage comparison`, owned: true, position: 1, createdAt: "2026-08-26T08:00:00.000Z" }] : [], entities: [] })));
  return {
    scope: { id: scope, label: scope === "portfolio" ? "Portfolio" : measuredSites[0]!.name, siteSlugs: measuredSites.map((item) => item.id), days: 90 },
    summary: { checks: observations.length, sitesMeasured: measuredSites.length, mentionRate: 86, citationRate: 71, avgRecommendationPosition: 2.1, positiveSentimentRate: 83, shareOfVoice: 54 },
    trend: Array.from({ length: 14 }, (_, day) => ({ date: `2026-08-${String(day + 13).padStart(2, "0")}`, mentionRate: 62 + day * 1.8, citationRate: 48 + day * 1.6, shareOfVoice: 39 + day * 1.2 })),
    platforms: platforms.map((platform, index) => ({ platform, checks: Math.max(1, measuredSites.length), mentionRate: 92 - index * 4, citationRate: 78 - index * 5, avgPosition: 1.5 + index * 0.25 })),
    observations,
    sources: [{ domain: measuredSites[0]!.host, citations: 9, owned: true, urls: [`https://${measuredSites[0]!.host}/mortgages`], platforms: ["chatgpt", "perplexity", "google_ai_overview"], prompts: ["What is the best way to compare UAE mortgage rates?"] }, { domain: "centralbank.ae", citations: 7, owned: false, urls: ["https://centralbank.ae/consumer-guidance"], platforms: ["gemini", "google_ai_overview"], prompts: ["What is the best way to compare UAE mortgage rates?"] }],
    competitors: [{ name: measuredSites[0]!.name, host: measuredSites[0]!.host, mentions: 18, owned: true, positive: 15, positions: [], shareOfVoice: 54, positiveRate: 83, avgPosition: 2.1 }, { name: "Competitor", host: "competitor.example", mentions: 10, owned: false, positive: 7, positions: [], shareOfVoice: 30, positiveRate: 70, avgPosition: 2.8 }],
    opportunities: [{ id: "50000000-0000-4000-8000-000000000001", siteSlug: measuredSites[0]!.id, prompt: "Which mortgage comparison site offers the clearest fee breakdown?", topic: "Fees", source: "gsc_question", priorityScore: 84, searchVolume: 880, aiSearchVolume: 340, intent: "commercial", status: "suggested", createdAt: "2026-08-26T08:00:00.000Z", updatedAt: "2026-08-26T08:00:00.000Z" }],
    crawlerAudit: platforms.slice(0, 6).map((platform, index) => ({ id: `qa-crawler-${index}`, siteSlug: measuredSites[0]!.id, siteName: measuredSites[0]!.name, bot: platform === "chatgpt" ? "GPTBot" : `${platform}-bot`, category: index < 4 ? "assistant" : "search", access: index === 5 ? "blocked" : "allowed", evidence: index === 5 ? "robots.txt contains a specific disallow rule." : "Root access is allowed by robots.txt.", robotsStatus: 200, capturedOn: "2026-08-26", createdAt: "2026-08-26T08:00:00.000Z" })),
    trackedPrompts: [{ id: "51000000-0000-4000-8000-000000000001", siteSlug: measuredSites[0]!.id, prompt: "What is the best way to compare UAE mortgage rates?", topic: "Mortgage comparison", platforms: ["chatgpt", "gemini", "google_ai_overview"], cadence: "weekly", priority: 90, sampleCount: 2, source: "manual", active: true, nextRunAt: "2026-08-27T08:00:00.000Z", createdAt: "2026-08-20T08:00:00.000Z", updatedAt: "2026-08-20T08:00:00.000Z", locationCode: 2784, languageCode: "en" }],
    recommendations: [{ kind: "source_gap", title: "Strengthen evidence from authoritative UAE sources", detail: "Central Bank guidance appears repeatedly in measured answers. Add a reviewed citation and clearer factual sourcing.", priority: 88, reviewOnly: true }],
  };
}

export function qaKeywordResearch(seed: string, locationCode: number, languageCode: string, locationLabel: string) {
  return { seed, locationCode, languageCode, locationLabel, fetchedAt: "2026-08-26", rows: Array.from({ length: 18 }, (_, index) => ({ keyword: `${seed} ${["comparison", "rates", "calculator", "guide", "fees", "eligibility"][index % 6]}${index > 5 ? ` ${Math.floor(index / 6) + 1}` : ""}`, volume: 5400 - index * 180, difficulty: 32 + index, cpc: 1.4 + index * 0.12, competition: 0.42 + index * 0.02, competitionLevel: index > 11 ? "high" : index > 5 ? "medium" : "low", intent: index % 3 === 0 ? "transactional" : index % 2 ? "commercial" : "informational", lowTopBid: 1.1 + index * 0.08, highTopBid: 3.2 + index * 0.18, trend: Array.from({ length: 12 }, (_, month) => 4200 - index * 90 + month * 35), monthlySearches: Array.from({ length: 12 }, (_, month) => ({ year: month > 7 ? 2025 : 2026, month: ((month + 8) % 12) + 1, volume: 4200 - index * 90 + month * 35 })) })) };
}
