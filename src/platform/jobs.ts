import { and, asc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DomainSyncReport } from "@/sync/engine";

export interface PlatformJobSummary {
  due: number;
  completed: number;
  failed: number;
  reports: DomainSyncReport[];
}

/** Process a bounded onboarding batch; subsequent cron runs resume the queue. */
export async function processPlatformJobs(
  sync: (siteSlug: string) => Promise<DomainSyncReport>,
  now = new Date(),
): Promise<PlatformJobSummary> {
  const limit = Math.min(Math.max(Number(process.env.ONBOARDING_JOBS_PER_RUN ?? "5"), 1), 20);
  const due = await db()
    .select()
    .from(schema.platformJobs)
    .where(and(eq(schema.platformJobs.status, "queued"), lte(schema.platformJobs.runAfter, now)))
    .orderBy(asc(schema.platformJobs.createdAt))
    .limit(limit);
  let completed = 0;
  let failed = 0;
  const reports: DomainSyncReport[] = [];
  for (const job of due) {
    try {
      await db().update(schema.platformJobs).set({ status: "running", attempts: job.attempts + 1, startedAt: now }).where(eq(schema.platformJobs.id, job.id));
      const report = await sync(job.siteSlug);
      reports.push(report);
      const errors = report.results.filter((item) => item.status === "error");
      if (errors.length) throw new Error(errors.map((item) => `${item.dataset}: ${item.note}`).join("; "));
      await db().transaction(async (tx) => {
        await tx.update(schema.platformJobs).set({ status: "completed", completedAt: new Date(), progress: { completed: report.results.filter((item) => item.status === "ok").map((item) => item.dataset) }, lastError: null }).where(eq(schema.platformJobs.id, job.id));
        await tx.update(schema.siteProfiles).set({ lifecycleStatus: "active", onboardingProgress: { initialScan: "completed" }, updatedAt: new Date() }).where(eq(schema.siteProfiles.slug, job.siteSlug));
      });
      completed++;
    } catch (error) {
      const terminal = job.attempts >= 2;
      await db().transaction(async (tx) => {
        await tx.update(schema.platformJobs).set({ status: terminal ? "failed" : "queued", attempts: job.attempts + 1, lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) }).where(eq(schema.platformJobs.id, job.id));
        if (terminal) await tx.update(schema.siteProfiles).set({ lifecycleStatus: "error", updatedAt: new Date() }).where(eq(schema.siteProfiles.slug, job.siteSlug));
      });
      failed++;
    }
  }
  return { due: due.length, completed, failed, reports };
}
