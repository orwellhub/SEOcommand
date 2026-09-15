import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { migrationDiff, type PageEvidence } from "@/lib/command-model";
import { commandRecords, saveCommandRecord } from "./command-store";
import { checkWatchedPage, collectBusiness, collectSpeed, inspectIndex } from "./command-collect";
import { getManagedSite, resolveGroupSiteSlugs } from "./site-store";
import { estimateScanCost } from "./scan-policy";
import type { ScanModule } from "./types";

export const COMMAND_CHECKS = ["speed", "indexing", "watch_run", "business"];
export async function queueCommandCheck(siteSlug: string, kind: string, payload: Record<string, unknown>, actor?: string | null) {
  if (hasDatabase() && process.env.QA_SYNTHETIC !== "true") {
    const row = await db().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`command:${siteSlug}:${kind}`}))`);
      const active = await tx.select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), eq(schema.commandRecords.kind, kind), inArray(schema.commandRecords.status, ["queued", "running"])));
      const same = active.find((item) => item.payload.url === payload.url && item.payload.device === payload.device && (item.payload.provider ?? "google") === (payload.provider ?? "google"));
      if (same) return same;
      if (active.length >= 20) throw new Error("Twenty checks are already pending for this tool. Wait for them to finish.");
      const [created] = await tx.insert(schema.commandRecords).values({ siteSlug, kind, recordKey: crypto.randomUUID(), payload, createdBy: actor, status: "queued" }).returning();
      return created!;
    });
    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), nextRunAt: row.nextRunAt?.toISOString() ?? null };
  }
  const recent = (await commandRecords(siteSlug)).filter((row) => row.kind === kind && ["queued", "running"].includes(row.status));
  const same = recent.find((row) => row.payload.url === payload.url && row.payload.device === payload.device && (row.payload.provider ?? "google") === (payload.provider ?? "google"));
  if (same) return same;
  if (recent.length >= 20) throw new Error("Twenty checks are already pending for this tool. Wait for them to finish.");
  return saveCommandRecord(siteSlug, kind, crypto.randomUUID(), payload, { actor, status: "queued" });
}

/** Atomic claims and separate result rows retain every completed measurement. */
export async function processCommandChecks(id?: string, stopped: () => boolean = () => false) {
  if (!hasDatabase() || process.env.QA_SYNTHETIC === "true") return;
  await db().update(schema.commandRecords).set({ status: "failed", payload: sql`${schema.commandRecords.payload} || ${JSON.stringify({ error: "The worker stopped during this check. Earlier results remain available; run the check again." })}::jsonb`, updatedAt: new Date() }).where(and(inArray(schema.commandRecords.kind, COMMAND_CHECKS), eq(schema.commandRecords.status, "running"), lte(schema.commandRecords.updatedAt, new Date(Date.now() - 15 * 60000)), id ? eq(schema.commandRecords.id, id) : undefined));
  const rows = await db().select().from(schema.commandRecords).where(and(inArray(schema.commandRecords.kind, COMMAND_CHECKS), eq(schema.commandRecords.status, "queued"), id ? eq(schema.commandRecords.id, id) : undefined)).orderBy(asc(schema.commandRecords.createdAt)).limit(id ? 1 : 12);
  for (const row of rows) {
    if (stopped()) break;
    const [claimed] = await db().update(schema.commandRecords).set({ status: "running", updatedAt: new Date() }).where(and(eq(schema.commandRecords.id, row.id), eq(schema.commandRecords.status, "queued"))).returning();
    if (!claimed) continue;
    try {
      const site = await getManagedSite(row.siteSlug); if (!site) throw new Error("Website no longer available.");
      let result: unknown;
      if (row.kind === "speed") result = await collectSpeed(site, String(row.payload.url), row.payload.device === "desktop" ? "desktop" : "mobile", row.payload.provider === "dataforseo" ? "dataforseo" : "google");
      else if (row.kind === "indexing") result = await inspectIndex(site, String(row.payload.url));
      else if (row.kind === "business") {
        const settings = (await commandRecords(site.id)).find((item) => item.kind === "settings")?.payload ?? {};
        result = await collectBusiness(site, (settings.businessEvents ?? {}) as Record<string, string>);
      } else {
        const checked = await checkWatchedPage(site, String(row.payload.url));
        const previous = await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, site.id), eq(schema.commandRecords.kind, "watch_run"), eq(schema.commandRecords.status, "completed"))).orderBy(desc(schema.commandRecords.createdAt)).limit(200);
        const baseline = previous.find((item) => item.payload.url === checked.url)?.payload as PageEvidence | undefined;
        const changes = baseline ? migrationDiff([baseline], [checked], site.host)[0]?.changes ?? [] : [];
        if (baseline?.hash && baseline.hash !== checked.hash) changes.push("Visible HTML content changed; review whether this was expected.");
        result = { ...checked, changes, firstCheck: !baseline };
        if (changes.length || checked.statusCode! >= 400 || !checked.indexable) {
          // In-app only: adding a watch does not authorize email/WhatsApp messages.
          await db().insert(schema.portfolioNotifications).values({ siteSlug: site.id, eventType: "important_page_changed", severity: checked.statusCode! >= 400 || !checked.indexable ? "high" : "medium", title: "An important page needs review", detail: `${checked.url}: ${changes.join("; ") || "Check HTTP status and indexing directives."}`, actionUrl: `/health?site=${site.id}&view=watchlist`, fingerprint: `watch:${row.id}` }).onConflictDoNothing();
        }
      }
      await db().update(schema.commandRecords).set({ status: "completed", payload: { ...row.payload, ...(result as Record<string, unknown>) }, updatedAt: new Date() }).where(eq(schema.commandRecords.id, row.id));
    } catch (error) {
      await db().update(schema.commandRecords).set({ status: "failed", payload: { ...row.payload, error: error instanceof Error ? error.message.slice(0, 700) : "Check failed." }, updatedAt: new Date() }).where(eq(schema.commandRecords.id, row.id));
    }
  }
}

export function nextPlanDate(cadence: string, now: Date) { return cadence === "once" ? null : new Date(now.getTime() + (cadence === "daily" ? 1 : cadence === "weekly" ? 7 : 30) * 86400000); }
export async function queueCommandSchedules(now = new Date()) {
  if (!hasDatabase() || process.env.QA_SYNTHETIC === "true") return;
  const due = await db().select().from(schema.commandRecords).where(and(inArray(schema.commandRecords.kind, ["watch", "plan"]), eq(schema.commandRecords.status, "active"), lte(schema.commandRecords.nextRunAt, now))).orderBy(asc(schema.commandRecords.nextRunAt)).limit(50);
  for (const row of due) {
    const site = await getManagedSite(row.siteSlug);
    if (!site || ["paused", "archived"].includes(site.lifecycleStatus)) continue;
    const modules = (row.payload.modules ?? []) as ScanModule[];
    if (row.kind === "plan" && estimateScanCost(modules).paidModules.length && site.spendApproval !== "approved") {
      await db().update(schema.commandRecords).set({ status: "paused", payload: { ...row.payload, error: "Website spending approval is required. Review the plan after approval." }, updatedAt: now }).where(eq(schema.commandRecords.id, row.id)); continue;
    }
    if (row.createdBy) {
      const [user] = await db().select().from(schema.workspaceUsers).where(eq(schema.workspaceUsers.email, row.createdBy)).limit(1);
      let allowed = !user;
      if (user?.status === "active") {
        const grants = await db().select().from(schema.userAccessGrants).where(eq(schema.userAccessGrants.userId, user.id));
        allowed = !grants.length && ["admin", "seo_analyst"].includes(user.role);
        for (const grant of grants) if (grant.permissions.includes("run_scans") && (grant.scopeType === "portfolio" || grant.scopeType === "site" && grant.scopeId === row.siteSlug || grant.scopeType === "group" && grant.scopeId && (await resolveGroupSiteSlugs(grant.scopeId)).includes(row.siteSlug))) allowed = true;
      }
      if (!allowed) { await db().update(schema.commandRecords).set({ status: "paused", payload: { ...row.payload, error: "The plan owner no longer has scan access. Review with a workspace administrator." }, updatedAt: now }).where(eq(schema.commandRecords.id, row.id)); continue; }
    }
    await db().transaction(async (tx) => {
      const [locked] = await tx.select().from(schema.commandRecords).where(and(eq(schema.commandRecords.id, row.id), eq(schema.commandRecords.status, "active"), lte(schema.commandRecords.nextRunAt, now))).for("update");
      if (!locked) return;
      if (row.kind === "plan") {
        const [active] = await tx.select({ id: schema.platformJobs.id }).from(schema.platformJobs).where(and(eq(schema.platformJobs.siteSlug, row.siteSlug), inArray(schema.platformJobs.status, ["running", "queued"]), inArray(schema.platformJobs.kind, ["site_scan", "initial_site_scan"]))).limit(1);
        if (active) return;
        await tx.insert(schema.platformJobs).values({ siteSlug: row.siteSlug, kind: "site_scan", requestedBy: row.createdBy, progress: { modules, label: row.payload.name ?? "Scheduled scan plan", planId: row.id, estimate: estimateScanCost(modules), phase: "queued", completed: [] } });
      } else await tx.insert(schema.commandRecords).values({ siteSlug: row.siteSlug, kind: "watch_run", recordKey: `watch:${row.id}:${now.toISOString().slice(0, 10)}`, status: "queued", payload: { url: row.payload.url }, createdBy: row.createdBy }).onConflictDoNothing();
      const next = nextPlanDate(row.kind === "watch" ? "daily" : String(row.payload.cadence), now);
      await tx.update(schema.commandRecords).set({ nextRunAt: next, status: next ? "active" : "completed", payload: { ...row.payload, lastQueuedAt: now.toISOString() }, updatedAt: now }).where(eq(schema.commandRecords.id, row.id));
    });
  }
}
