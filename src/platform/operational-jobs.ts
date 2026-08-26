import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { queueBrowserCrawl, runBrowserCrawl } from "./advanced-crawler";
import { listDueLocalLocations, syncLocalLocation } from "./local-seo";
import { checkReliability } from "./reliability";
import { getManagedSite, listManagedSites } from "./site-store";

export async function processBrowserCrawlJobs(now = new Date()) {
  const limit = Math.min(Math.max(Number(process.env.BROWSER_CRAWL_JOBS_PER_RUN ?? "1"), 1), 5);
  const jobs = await db().select().from(schema.platformJobs)
    .where(and(eq(schema.platformJobs.kind, "browser_crawl"), eq(schema.platformJobs.status, "queued"), lte(schema.platformJobs.runAfter, now)))
    .orderBy(asc(schema.platformJobs.createdAt)).limit(limit);
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await db().update(schema.platformJobs).set({ status: "running", attempts: job.attempts + 1, startedAt: new Date() }).where(eq(schema.platformJobs.id, job.id));
      const site = await getManagedSite(job.siteSlug);
      if (!site) throw new Error("Website no longer exists.");
      const maxPages = Number(job.progress?.maxPages) || undefined;
      const result = await runBrowserCrawl(site, maxPages);
      await db().update(schema.platformJobs).set({ status: "completed", completedAt: new Date(), progress: result as unknown as Record<string, unknown>, lastError: null }).where(eq(schema.platformJobs.id, job.id));
      completed++;
    } catch (error) {
      const terminal = job.attempts >= 2;
      await db().update(schema.platformJobs).set({
        status: terminal ? "failed" : "queued",
        attempts: job.attempts + 1,
        runAfter: terminal ? job.runAfter : new Date(Date.now() + 60 * 60 * 1_000),
        lastError: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
      }).where(eq(schema.platformJobs.id, job.id));
      failed++;
    }
  }
  return { due: jobs.length, completed, failed };
}

export async function queueDueBrowserCrawls(now = new Date()) {
  if (process.env.AUTO_BROWSER_CRAWLS === "0") return { considered: 0, queued: 0 };
  const sites = (await listManagedSites()).filter((site) => site.lifecycleStatus !== "paused");
  let queued = 0;
  for (const site of sites) {
    if (queued >= 25) break;
    const [latest] = await db().select({ completedAt: schema.browserCrawlRuns.completedAt })
      .from(schema.browserCrawlRuns).where(eq(schema.browserCrawlRuns.siteSlug, site.id))
      .orderBy(desc(schema.browserCrawlRuns.startedAt)).limit(1);
    if (latest?.completedAt && now.getTime() - latest.completedAt.getTime() < 28 * 24 * 60 * 60 * 1_000) continue;
    const job = await queueBrowserCrawl(site.id);
    if (job.status === "queued" && job.createdAt.getTime() > now.getTime() - 60_000) queued++;
  }
  return { considered: sites.length, queued };
}

async function mapConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]!).catch(() => undefined);
    }
  });
  await Promise.all(workers);
}

export async function runReliabilityChecks() {
  const sites = (await listManagedSites()).filter((site) => site.lifecycleStatus !== "paused");
  let checked = 0;
  let failed = 0;
  await mapConcurrent(sites, Math.min(Math.max(Number(process.env.RELIABILITY_CONCURRENCY ?? "8"), 1), 20), async (site) => {
    try {
      await checkReliability(site);
      checked++;
    } catch {
      failed++;
    }
  });
  return { due: sites.length, checked, failed };
}

export async function processDueLocalSeo() {
  const due = await listDueLocalLocations();
  const limit = Math.min(Math.max(Number(process.env.LOCAL_SEO_LOCATIONS_PER_RUN ?? "2"), 1), 10);
  let completed = 0;
  let failed = 0;
  for (const location of due.slice(0, limit)) {
    try {
      await syncLocalLocation(location.id);
      completed++;
    } catch {
      failed++;
    }
  }
  return { due: due.length, attempted: Math.min(due.length, limit), completed, failed };
}
