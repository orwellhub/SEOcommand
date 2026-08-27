import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DomainSyncReport, SyncTiers } from "@/sync/engine";
import { queueBrowserCrawl } from "./advanced-crawler";
import { checkReliability } from "./reliability";
import { getManagedSite } from "./site-store";
import { FULL_SCAN_MODULES, tiersForModules } from "./scan-policy";
import type { ScanModule } from "./types";

export interface PlatformJobSummary {
  due: number;
  completed: number;
  failed: number;
  reports: DomainSyncReport[];
}

/** Process a bounded onboarding batch; subsequent cron runs resume the queue. */
export async function processPlatformJobs(
  sync: (siteSlug: string, tiers?: SyncTiers) => Promise<DomainSyncReport>,
  now = new Date(),
): Promise<PlatformJobSummary> {
  const limit = Math.min(Math.max(Number(process.env.ONBOARDING_JOBS_PER_RUN ?? "5"), 1), 20);
  const due = await db()
    .select()
    .from(schema.platformJobs)
    .where(and(inArray(schema.platformJobs.kind, ["initial_site_scan", "site_scan"]), eq(schema.platformJobs.status, "queued"), lte(schema.platformJobs.runAfter, now)))
    .orderBy(asc(schema.platformJobs.createdAt))
    .limit(limit);
  let completed = 0;
  let failed = 0;
  const reports: DomainSyncReport[] = [];
  for (const job of due) {
    try {
      const requested = Array.isArray(job.progress.modules)
        ? job.progress.modules.filter((value): value is ScanModule => typeof value === "string" && FULL_SCAN_MODULES.includes(value as ScanModule))
        : FULL_SCAN_MODULES;
      await db().update(schema.platformJobs).set({
        status: "running",
        attempts: job.attempts + 1,
        startedAt: now,
        progress: { ...job.progress, modules: requested, phase: "collecting", completed: [] },
      }).where(eq(schema.platformJobs.id, job.id));
      const report = await sync(job.siteSlug, tiersForModules(requested));
      reports.push(report);
      const errors = report.results.filter((item) => item.status === "error");
      if (errors.length) throw new Error(errors.map((item) => `${item.dataset}: ${item.note}`).join("; "));
      const site = await getManagedSite(job.siteSlug);
      if (site && requested.includes("technical")) await queueBrowserCrawl(job.siteSlug, site.crawlMaxPages);
      if (site && requested.includes("reliability")) await checkReliability(site);
      await db().transaction(async (tx) => {
        await tx.update(schema.platformJobs).set({
          status: "completed",
          completedAt: new Date(),
          progress: {
            ...job.progress,
            modules: requested,
            phase: "completed",
            completed: requested,
            datasets: report.results.map((item) => ({ dataset: item.dataset, status: item.status, note: item.note })),
          },
          lastError: null,
        }).where(eq(schema.platformJobs.id, job.id));
        if (job.kind === "initial_site_scan") {
          await tx.update(schema.siteProfiles).set({ lifecycleStatus: "active", onboardingProgress: { initialScan: "completed" }, updatedAt: new Date() }).where(eq(schema.siteProfiles.slug, job.siteSlug));
        }
      });
      completed++;
    } catch (error) {
      const terminal = job.attempts >= 2;
      await db().transaction(async (tx) => {
        await tx.update(schema.platformJobs).set({ status: terminal ? "failed" : "queued", attempts: job.attempts + 1, lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) }).where(eq(schema.platformJobs.id, job.id));
        if (terminal && job.kind === "initial_site_scan") await tx.update(schema.siteProfiles).set({ lifecycleStatus: "error", updatedAt: new Date() }).where(eq(schema.siteProfiles.slug, job.siteSlug));
      });
      failed++;
    }
  }
  return { due: due.length, completed, failed, reports };
}
