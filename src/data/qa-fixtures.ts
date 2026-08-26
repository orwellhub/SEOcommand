import type { DomainLiveBundle, PortfolioLive } from "@/lib/live";
import type { ManagedSite, PortfolioGroup } from "@/platform/types";

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
      keywords: ds(Array.from({ length: 12 }, (_, keyword) => ({ id: `${site.id}-kw-${keyword}`, domainId: site.id, term: `sample keyword ${keyword + 1}`, intent: keyword % 2 ? "commercial" : "informational", volume: 900 - keyword * 35, difficulty: 30 + keyword, cpc: 1.2, tags: ["qa"] }))),
      rank_snapshots: ds(Array.from({ length: 12 }, (_, keyword) => ({ keywordId: `${site.id}-kw-${keyword}`, keyword: `sample keyword ${keyword + 1}`, date, position: 2 + keyword, prevPosition: 3 + keyword, device: "desktop", location: site.primaryMarket, url: `https://${site.host}/page-${keyword}`, volume: 900 - keyword * 35, serpFeatures: [], tags: ["qa"] }))),
      competitors: ds([{ id: `${site.id}-comp-1`, domainId: site.id, host: "competitor.example", commonKeywords: 84, keywords: 1240, authority: 62, estTraffic: 12400, overlapPct: 37, trend: "up" }]),
      backlinks: ds(Array.from({ length: 10 }, (_, link) => ({ id: `${site.id}-bl-${link}`, domainId: site.id, sourceDomain: `publisher-${link}.example`, sourceUrl: `https://publisher-${link}.example/story`, targetUrl: `https://${site.host}/`, anchor: site.name, authority: 45 + link, follow: link % 3 !== 0, firstSeen: date, lastSeen: date, status: "active", toxicity: link }))),
      referring_domains: ds(Array.from({ length: 8 + index }, (_, ref) => ({ id: `${site.id}-rd-${ref}`, domainId: site.id, host: `publisher-${ref}.example`, authority: 40 + ref, backlinks: 1 + ref % 3, firstSeen: date, follow: ref % 3 !== 0 }))),
      recommendations: ds([{ id: `${site.id}-rec-1`, domainId: site.id, title: "Resolve high-impact indexability change", module: "Technical", priorityScore: 86 - index, estImpact: "Protect organic traffic", confidence: "high", effort: "S", evidence: "Synthetic QA recommendation", relatedMetric: "Health score" }]),
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
    groups: QA_GROUPS, notificationRule: { channels: ["in_app", "email"], recipients: ["email:qa@example.test"], eventTypes: ["rank_drop", "technical_regression", "site_unavailable"], rankDropThreshold: 5, trafficDropPct: 20, enabled: true },
    spend: { month: "2026-08", totalUsd: site.id === "mortgagecompare" ? 2.46 : 0.84, lines: [] },
    auditEvents: [{ id: "qa-audit", actorEmail: "qa@orwell.local", actorRole: "admin", action: "updated", area: "budget", summary: "Approved synthetic QA budget.", createdAt: "2026-08-26T08:00:00.000Z" }],
    credentialPolicy: "Synthetic QA: central connector mappings only; no credentials or provider calls are present.",
  };
}
