import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { listManagedSites, resolveGroupSiteSlugs } from "@/platform/site-store";
import { QA_SITES } from "@/data/qa-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "150");
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 150, 25), 250);
  const allSites = await listManagedSites();
  const role = request.headers.get("x-orwell-user-role");
  const groupIds = request.headers.get("x-orwell-user-groups")?.split(",").filter(Boolean) ?? [];
  const restricted = role === "manager" || role === "viewer";
  const allowed = restricted
    ? new Set((await Promise.all(groupIds.map(resolveGroupSiteSlugs))).flat())
    : new Set(allSites.map((site) => site.id));
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
        score: index % 4 === 0 ? 100 : index % 3 === 0 ? 75 : 45, actionUrl: `/sites/${site.id}`, createdAt: new Date(Date.UTC(2026, 7, 26, 8, index)),
      },
      {
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, kind: "recommendation" as const,
        siteSlug: site.id, siteName: site.name, title: "Improve the highest-potential landing page",
        detail: "Content · M effort", status: index % 4 === 0 ? "in_progress" : "approved", severity: "high",
        score: 78 - index, actionUrl: "/recommendations", createdAt: new Date(Date.UTC(2026, 7, 25, 8, index)),
      },
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
  const [notices, tasks] = await Promise.all([
    db().select().from(schema.portfolioNotifications)
      .where(inArray(schema.portfolioNotifications.siteSlug, slugs))
      .orderBy(desc(schema.portfolioNotifications.createdAt)).limit(150),
    db().select().from(schema.workflowItems)
      .where(inArray(schema.workflowItems.domainSlug, slugs))
      .orderBy(desc(schema.workflowItems.priorityScore), desc(schema.workflowItems.updatedAt)).limit(150),
  ]);
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
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
        actionUrl: notice.actionUrl,
        createdAt: notice.createdAt,
      })),
    ...tasks
      .filter((task) => task.decision === "approved" && task.status !== "done")
      .map((task) => ({
        id: task.id,
        kind: "recommendation" as const,
        siteSlug: task.domainSlug,
        siteName: siteName.get(task.domainSlug) ?? task.domainSlug,
        title: task.title,
        detail: `${task.module} · ${task.effort} effort`,
        status: task.status ?? "approved",
        severity: task.priorityScore >= 80 ? "high" : task.priorityScore >= 50 ? "medium" : "low",
        score: task.priorityScore,
        actionUrl: "/recommendations",
        createdAt: task.updatedAt,
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
