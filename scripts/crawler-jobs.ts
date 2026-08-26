/**
 * Hourly operational runner. Reliability checks stay lightweight; browser
 * crawls and local grids are bounded queues so 300 sites cannot stampede the
 * database or paid providers.
 */
import { closeDb } from "../src/db";
import { processBrowserCrawlJobs, processDueLocalSeo, queueDueBrowserCrawls, runReliabilityChecks } from "../src/platform/operational-jobs";

let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; });
process.on("SIGINT", () => { shuttingDown = true; });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const reliability = await runReliabilityChecks();
  console.log(`[orwell-operations] Reliability: ${reliability.checked}/${reliability.due} checked, ${reliability.failed} failed.`);
  if (shuttingDown) return;
  const scheduled = await queueDueBrowserCrawls();
  console.log(`[orwell-operations] Browser schedule: ${scheduled.queued} queued across ${scheduled.considered} websites.`);
  const crawls = await processBrowserCrawlJobs();
  console.log(`[orwell-operations] Browser crawls: ${crawls.completed}/${crawls.due} complete, ${crawls.failed} failed.`);
  if (shuttingDown) return;
  const local = await processDueLocalSeo();
  console.log(`[orwell-operations] Local SEO: ${local.completed}/${local.attempted} complete, ${local.failed} failed, ${local.due} due.`);
}

main()
  .then(async () => { await closeDb(); process.exit(0); })
  .catch(async (error) => { console.error("[orwell-operations] Fatal error:", error); await closeDb().catch(() => undefined); process.exit(1); });
