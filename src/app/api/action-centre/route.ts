import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { applyLearningAdjustment, buildLearningSignals } from "@/platform/outcome-ledger";
import { hasDatabase } from "@/sync/store";
import { listManagedSites } from "@/platform/site-store";
import { QA_SITES } from "@/data/qa-fixtures";
import { accessibleSiteSlugs } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "150");
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 150, 25), 250);
  const allSites = await listManagedSites();
  const granted = await accessibleSiteSlugs(request);
  const allowed = new Set(granted ?? allSites.map((site) => site.id));
  const sites = allSites.filter((site) => allowed.has(site.id));
  if (process.env.QA_SYNTHETIC === "true") {
    const allItems = sites.flatMap((site) => {
      const index = QA_SITES.findIndex((item) => item.id === site.id);
      return [
      {
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, kind: "alert" as const,
        siteSlug: site.id, siteName: site.name, title: index % 4 === 0 ? "Technical health needs attention" : "Tracked rankings moved",
        detail: index % 4 === 0 ? "High-impact synthetic crawl evidence is ready for review." : "A monitored keyword moved beyond the configured threshold.",
        status: "open", severity: index % 4 === 0 ? "critical" : index % 3 === 0 ? "high" : "medium",
        score: index % 4 === 0 ? 100 : index % 3 === 0 ? 75 : 45, actionUrl: index % 4 === 0 ? `/site-audit?site=${site.id}` : `/rankings?site=${site.id}`, createdAt: new Date(Date.UTC(2026, 7, 26, 8, index)),
      },
      {
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, kind: "recommendation" as const,
        siteSlug: site.id, siteName: site.name, title: "Improve the highest-potential landing page",
        detail: "Content · M effort", status: index % 4 === 0 ? "in_progress" : "approved", severity: "high",
        score: 78 - index, actionUrl: `/recommendations?site=${site.id}&item=30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, createdAt: new Date(Date.UTC(2026, 7, 25, 8, index)),
      },
      ...(index === 0 ? [{
        id: "72000000-0000-4000-8000-000000000001", kind: "research" as const,
        siteSlug: site.id, siteName: site.name, title: "Investigate competitor.example opportunity",
        detail: "Mapped domain evidence · awaiting approval", status: "mapped", severity: "medium" as const,
        duplicateWarning: { severity: "none", summary: "No overlap found in the latest stored website evidence.", matches: [] },
        score: 70, actionUrl: "/domain-research?evidence=71000000-0000-4000-8000-000000000001&mapping=72000000-0000-4000-8000-000000000001", createdAt: new Date(Date.UTC(2026, 7, 27, 9, 0)),
      }] : []),
      ];
    }).sort((a, b) => b.score - a.score);
    const items = allItems.slice(0, limit);
    return NextResponse.json({
      items,
      counts: { urgent: allItems.filter((item) => item.score >= 75).length, open: allItems.length, paused: sites.filter((site) => site.lifecycleStatus === "paused").length },
      meta: { returned: items.length, total: allItems.length, hasMore: allItems.length > items.length },
    });
  }
  if (!hasDatabase() || sites.length === 0) {
    return NextResponse.json({ items: [], counts: { urgent: 0, open: 0, paused: 0 }, meta: { returned: 0, total: 0, hasMore: false } });
  }
  const slugs = sites.map((site) => site.id);
  const [notices, tasks, mappedResearch] = await Promise.all([
    db().select().from(schema.portfolioNotifications)
      .where(inArray(schema.portfolioNotifications.siteSlug, slugs))
      .orderBy(desc(schema.portfolioNotifications.createdAt)).limit(150),
    db().select().from(schema.workflowItems)
      .where(inArray(schema.workflowItems.domainSlug, slugs))
      .orderBy(desc(schema.workflowItems.priorityScore), desc(schema.workflowItems.updatedAt)).limit(150),
    db().select({ mapping: schema.researchMappings, evidence: schema.researchEvidence })
      .from(schema.researchMappings)
      .innerJoin(schema.researchEvidence, eq(schema.researchEvidence.id, schema.researchMappings.evidenceId))
      .where(and(inArray(schema.researchMappings.siteSlug, slugs), eq(schema.researchMappings.status, "mapped")))
      .orderBy(desc(schema.researchMappings.priorityScore), desc(schema.researchMappings.updatedAt)).limit(150),
  ]);
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  const learning = buildLearningSignals(tasks);
  const learningByWork = new Map(learning.map((signal) => [`${signal.domainSlug}:${signal.executionType}`, signal]));
  const severityScore = { critical: 100, high: 75, medium: 45, low: 20 };
  const allItems = [
    ...notices
      .filter((notice) => notice.status === "open" || (notice.status === "snoozed" && notice.snoozedUntil && notice.snoozedUntil <= new Date()))
      .map((notice) => ({
        id: notice.id,
        kind: "alert" as const,
        siteSlug: notice.siteSlug,
        siteName: notice.siteSlug ? siteName.get(notice.siteSlug) ?? notice.siteSlug : "Portfolio",
        title: notice.title,
        detail: notice.detail,
        status: notice.status,
        severity: notice.severity,
        score: severityScore[notice.severity],
        actionUrl: notice.actionUrl ? `${notice.actionUrl}${notice.siteSlug && !notice.actionUrl.includes("site=") ? `${notice.actionUrl.includes("?") ? "&" : "?"}site=${encodeURIComponent(notice.siteSlug)}` : ""}` : notice.siteSlug ? `/sites/${notice.siteSlug}` : "/portfolio",
        createdAt: notice.createdAt,
      })),
    ...tasks
      .filter((task) => task.decision === "approved" && task.status !== "done")
      .map((task) => { const signal = learningByWork.get(`${task.domainSlug}:${task.executionType ?? "general"}`); const learnedScore = applyLearningAdjustment(task.priorityScore, signal); return ({
        id: task.id,
        kind: "recommendation" as const,
        siteSlug: task.domainSlug,
        siteName: siteName.get(task.domainSlug) ?? task.domainSlug,
        title: task.title,
        detail: `${task.module} · ${task.effort} effort${signal?.adjustment ? ` · outcome learning ${signal.adjustment > 0 ? "+" : ""}${signal.adjustment}` : ""}`,
        status: task.status ?? "approved",
        severity: learnedScore >= 80 ? "high" : learnedScore >= 50 ? "medium" : "low",
        score: learnedScore,
        actionUrl: task.executionType ? `/work?item=${encodeURIComponent(task.id)}` : task.sourceUrl ?? `/recommendations?site=${encodeURIComponent(task.domainSlug)}&item=${encodeURIComponent(task.id)}`,
        createdAt: task.updatedAt,
      }); }),
    ...mappedResearch.map(({ mapping, evidence }) => ({
      id: mapping.id,
      kind: "research" as const,
      siteSlug: mapping.siteSlug,
      siteName: siteName.get(mapping.siteSlug) ?? mapping.siteSlug,
      title: mapping.title,
      detail: `${mapping.executionType.replace(/_/g, " ")} · ${mapping.pageMode.replace(/_/g, " ")} · ${mapping.ownerEmail ?? "Unassigned"}${mapping.dueDate ? ` · due ${mapping.dueDate}` : ""}`,
      duplicateWarning: mapping.duplicateWarning,
      status: mapping.status,
      severity: mapping.priorityScore >= 80 ? "high" as const : mapping.priorityScore >= 50 ? "medium" as const : "low" as const,
      score: mapping.priorityScore,
      actionUrl: `/domain-research?evidence=${encodeURIComponent(evidence.id)}&mapping=${encodeURIComponent(mapping.id)}`,
      createdAt: mapping.updatedAt,
    })),
  ].sort((a, b) => b.score - a.score || +new Date(b.createdAt) - +new Date(a.createdAt));
  const items = allItems.slice(0, limit);
  return NextResponse.json({
    items,
    counts: {
      urgent: allItems.filter((item) => item.score >= 75).length,
      open: allItems.length,
      paused: sites.filter((site) => site.lifecycleStatus === "paused").length,
    },
    meta: { returned: items.length, total: allItems.length, hasMore: allItems.length > items.length },
  });
}
