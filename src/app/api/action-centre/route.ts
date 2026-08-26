import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { listManagedSites, resolveGroupSiteSlugs } from "@/platform/site-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const allSites = await listManagedSites();
  const role = request.headers.get("x-orwell-user-role");
  const groupIds = request.headers.get("x-orwell-user-groups")?.split(",").filter(Boolean) ?? [];
  const restricted = role === "manager" || role === "viewer";
  const allowed = restricted
    ? new Set((await Promise.all(groupIds.map(resolveGroupSiteSlugs))).flat())
    : new Set(allSites.map((site) => site.id));
  const sites = allSites.filter((site) => allowed.has(site.id));
  if (!hasDatabase() || sites.length === 0) {
    return NextResponse.json({ items: [], counts: { urgent: 0, open: 0, paused: 0 }, sites });
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
  const items = [
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
  return NextResponse.json({
    items,
    counts: {
      urgent: items.filter((item) => item.score >= 75).length,
      open: items.length,
      paused: sites.filter((site) => site.lifecycleStatus === "paused").length,
    },
    sites,
  });
}
