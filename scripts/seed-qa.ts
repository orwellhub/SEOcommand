/**
 * Idempotent synthetic staging dataset for UI/UX and 20-site load QA.
 * It refuses to run unless QA_SYNTHETIC=true and never calls external providers.
 */
import { closeDb, db, schema } from "../src/db";

const COLORS = ["#335CFF", "#12B8C4", "#FF6B5E", "#F2B544", "#16A879"];
const GROUPS = [
  { slug: "finance", name: "Finance", color: "#335CFF", parent: null },
  { slug: "uae", name: "UAE", color: "#12B8C4", parent: "finance" },
  { slug: "growth", name: "Growth portfolio", color: "#FF6B5E", parent: null },
  { slug: "launches", name: "Launches", color: "#F2B544", parent: "growth" },
] as const;

function provenance(index: number) {
  const captured = new Date(Date.UTC(2026, 7, 26, 8, index)).toISOString();
  return {
    source: "demo" as const, collectedAt: captured, rangeStart: "2026-07-30", rangeEnd: "2026-08-26",
    location: index % 2 ? "United Kingdom" : "United Arab Emirates", device: index % 3 ? "desktop" as const : "mobile" as const,
    freshness: "fresh" as const, mode: "demo" as const,
  };
}

async function main() {
  if (process.env.QA_SYNTHETIC !== "true") throw new Error("Refusing to seed outside QA_SYNTHETIC=true.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const database = db();
  const groupIds = new Map<string, string>();
  for (const group of GROUPS) {
    const parentId = group.parent ? groupIds.get(group.parent) ?? null : null;
    const [saved] = await database.insert(schema.portfolioGroups).values({
      slug: group.slug, name: group.name, color: group.color, parentId,
      description: "Synthetic staging group", sortOrder: groupIds.size,
    }).onConflictDoUpdate({
      target: schema.portfolioGroups.slug,
      set: { name: group.name, color: group.color, parentId, updatedAt: new Date() },
    }).returning();
    if (saved) groupIds.set(group.slug, saved.id);
  }

  for (let index = 0; index < 20; index++) {
    const mortgage = index === 0;
    const slug = mortgage ? "mortgagecompare" : `qa-site-${String(index + 1).padStart(2, "0")}`;
    const name = mortgage ? "MortgageCompare" : `QA Website ${String(index + 1).padStart(2, "0")}`;
    const host = mortgage ? "mortgagecompare.ae" : `site-${index + 1}.example.test`;
    const health = 96 - (index * 7 % 37);
    const critical = index % 6 === 0 ? 2 : index % 4 === 0 ? 1 : 0;
    const [site] = await database.insert(schema.siteProfiles).values({
      slug, name, host, accent: COLORS[index % COLORS.length]!, industry: mortgage ? "UAE mortgage comparison" : "Synthetic QA business",
      primaryMarket: index % 2 ? "United Kingdom" : "United Arab Emirates", locationCode: index % 2 ? 2826 : 2784,
      languageCode: "en", devices: index % 3 ? ["desktop", "mobile"] : ["mobile"],
      gscProperty: mortgage ? "sc-domain:mortgagecompare.ae" : `sc-domain:${host}`,
      ga4Property: mortgage ? "529950642" : `90000${index}`,
      lifecycleStatus: index === 18 ? "paused" : index === 19 ? "pre_launch" : "active",
      spendApproval: index % 4 === 0 ? "pending" : "approved",
      forecastMonthlyUsd: 3.2 + index * 0.18, approvedMonthlyUsd: index % 4 === 0 ? null : 10,
      budgetLimits: { rankings: 2, crawling: 2, backlinks: 2, competitors: 1, ai: 2, local_seo: 1 },
      monitoringSchedule: { rankings: "daily", crawling: "monthly", backlinks: "weekly", competitors: "weekly", ai: "weekly", localSeo: "weekly", reliability: "hourly" },
      siteSettings: { trackedKeywords: ["best service", "compare providers"], competitors: ["example-competitor.com"], localGridSize: "3x3" },
      crawlMaxPages: 10000, backlinkLimit: 10000, createdBy: "qa@orwell.local",
    }).onConflictDoUpdate({
      target: schema.siteProfiles.slug,
      set: { name, host, accent: COLORS[index % COLORS.length]!, updatedAt: new Date() },
    }).returning();
    if (!site) continue;
    const groupSlug = index < 10 ? (index < 6 ? "uae" : "finance") : (index < 16 ? "growth" : "launches");
    const groupId = groupIds.get(groupSlug);
    if (groupId) await database.insert(schema.siteGroupMemberships).values({ groupId, siteSlug: slug }).onConflictDoNothing();
    if (index % 5 === 0 && groupIds.get("growth")) await database.insert(schema.siteGroupMemberships).values({ groupId: groupIds.get("growth")!, siteSlug: slug }).onConflictDoNothing();

    const capturedOn = "2026-08-26";
    const p = provenance(index);
    const snapshots = [
      { dataset: "gsc_totals", payload: { clicks: 840 + index * 117, impressions: 18400 + index * 930, ctr: 4.6 + index * 0.05, position: 8.4 + index * 0.21 } },
      { dataset: "ga4_overview", payload: { sessions: 1100 + index * 91, totalUsers: 900 + index * 74, newUsers: 680 + index * 63, engagedSessions: 720 + index * 54, engagementRate: 61.2, conversions: 18 + index * 2, screenPageViews: 1900 + index * 110 } },
      { dataset: "onpage", payload: { healthScore: health, breakdown: [{ category: "Indexability", weight: 0.3, score: health, issues: critical }], crawlRun: { id: `qa-crawl-${index}`, domainId: slug, startedAt: p.collectedAt, completedAt: p.collectedAt, pagesCrawled: 420 + index * 23, healthScore: health, newIssues: critical, resolvedIssues: index % 3, status: "completed" }, issues: Array.from({ length: critical }, (_, issue) => ({ id: `qa-issue-${index}-${issue}`, domainId: slug, title: issue ? "Canonical conflict" : "Blocked indexable page", category: "Indexability", severity: issue ? "high" : "critical", explanation: "Synthetic QA evidence", affectedPages: 2 + issue, samplePages: [`https://${host}/sample-${issue}`], evidence: "Synthetic staging signal", recommendedFix: "Review the affected template.", potentialImpact: "Search visibility", firstSeen: capturedOn, lastSeen: capturedOn, status: "open", taskId: null })) } },
      { dataset: "visibility_point", payload: { date: capturedOn, value: 42 + index * 2 } },
      { dataset: "keywords", payload: Array.from({ length: 12 }, (_, keyword) => ({ id: `${slug}-kw-${keyword}`, domainId: slug, term: `sample keyword ${keyword + 1}`, intent: keyword % 2 ? "commercial" : "informational", volume: 900 - keyword * 35, difficulty: 30 + keyword, cpc: 1.2, tags: ["qa"] })) },
      { dataset: "rank_snapshots", payload: Array.from({ length: 12 }, (_, keyword) => ({ keywordId: `${slug}-kw-${keyword}`, keyword: `sample keyword ${keyword + 1}`, date: capturedOn, position: 2 + keyword, prevPosition: 3 + keyword, device: "desktop", location: p.location, url: `https://${host}/page-${keyword}`, volume: 900 - keyword * 35, serpFeatures: [], tags: ["qa"] })) },
      { dataset: "position_buckets", payload: [{ label: "1-3", count: 2, prevCount: 1 }, { label: "4-10", count: 7, prevCount: 6 }, { label: "11-20", count: 3, prevCount: 5 }] },
      { dataset: "referring_domains", payload: Array.from({ length: 8 + index }, (_, ref) => ({ id: `${slug}-rd-${ref}`, domainId: slug, host: `publisher-${ref}.example`, authority: 40 + ref, backlinks: 1 + ref % 3, firstSeen: capturedOn, follow: ref % 3 !== 0 })) },
      { dataset: "backlinks", payload: Array.from({ length: 10 }, (_, link) => ({ id: `${slug}-bl-${link}`, domainId: slug, sourceDomain: `publisher-${link}.example`, sourceUrl: `https://publisher-${link}.example/story`, targetUrl: `https://${host}/`, anchor: name, authority: 45 + link, follow: link % 3 !== 0, firstSeen: capturedOn, lastSeen: capturedOn, status: "active", toxicity: link })) },
      { dataset: "competitors", payload: [{ id: `${slug}-comp-1`, domainId: slug, host: "competitor.example", commonKeywords: 84, keywords: 1240, authority: 62, estTraffic: 12400, overlapPct: 37, trend: "up" }] },
      { dataset: "ai_prompts", payload: [{ id: `${slug}-ai-1`, domainId: slug, prompt: `What is the best option for ${name} customers?`, model: "ChatGPT", checkedAt: p.collectedAt, mentioned: index % 3 !== 0, cited: index % 4 !== 0, mentionRate: 45 + index, citationRate: 24 + index, sentiment: "neutral", competitors: ["Competitor"], response: "Synthetic QA response evidence." }] },
      { dataset: "gsc_timeseries", payload: Array.from({ length: 28 }, (_, day) => ({ date: `2026-08-${String(day + 1).padStart(2, "0")}`, clicks: 22 + index * 2 + day, impressions: 480 + index * 15 + day * 6, ctr: 4.8, position: 8.4 })) },
      { dataset: "recommendations", payload: [{ id: `${slug}-rec-1`, domainId: slug, title: "Resolve high-impact indexability change", module: "Technical", priorityScore: 86 - index, estImpact: "Protect organic traffic", confidence: "high", effort: "S", evidence: "Synthetic QA recommendation", relatedMetric: "Health score" }] },
    ];
    for (const snapshot of snapshots) await database.insert(schema.datasetSnapshots).values({ domainSlug: slug, dataset: snapshot.dataset, capturedOn, payload: snapshot.payload, provenance: p }).onConflictDoUpdate({
      target: [schema.datasetSnapshots.domainSlug, schema.datasetSnapshots.dataset, schema.datasetSnapshots.capturedOn],
      set: { payload: snapshot.payload, provenance: p },
    });
    await database.insert(schema.portfolioNotifications).values({
      siteSlug: slug, eventType: critical ? "technical_regression" : "rank_drop",
      severity: critical ? "critical" : index % 3 === 0 ? "high" : "medium",
      title: critical ? "Technical health needs attention" : "Tracked rankings moved",
      detail: critical ? `${critical} high-impact issues detected in the latest synthetic crawl.` : "A monitored keyword moved beyond the configured threshold.",
      actionUrl: `/sites/${slug}`, fingerprint: `qa-notice-${slug}`,
    }).onConflictDoNothing();
    await database.insert(schema.workflowItems).values({
      domainSlug: slug, recommendationKey: `qa-recommendation-${slug}`, decision: "approved",
      title: "Improve the highest-potential landing page", module: "Content", effort: "M",
      priorityScore: 78 - index, status: index % 4 === 0 ? "in_progress" : "approved", createdBy: "qa@orwell.local",
    }).onConflictDoUpdate({
      target: [schema.workflowItems.domainSlug, schema.workflowItems.recommendationKey],
      set: { priorityScore: 78 - index, updatedAt: new Date() },
    });
  }
  console.log("Synthetic QA seed complete: 20 websites, nested groups, evidence, actions and settings.");
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
