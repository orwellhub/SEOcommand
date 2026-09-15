/**
 * Hourly operational runner. Reliability checks stay lightweight; browser
 * crawls and local grids are bounded queues so 300 sites cannot stampede the
 * database or paid providers.
 */
import { processPlatformJobs } from "../src/platform/jobs";
import { syncDomain } from "../src/sync/engine";
import { closeDb } from "../src/db";
import { processBrowserCrawlJobs, processDueLocalSeo, queueDueBrowserCrawls, runReliabilityChecks } from "../src/platform/operational-jobs";

import { processCommandChecks, queueCommandSchedules } from "../src/platform/command-jobs";
import { notifyOutreachFollowups, processOutreachMonitoring } from "../src/platform/outreach-monitor";
import { processResearchJobs } from "../src/platform/research-jobs";

import { processReportArchives } from "../src/reports/archive";
import { deliverDueReports } from "../src/reports/delivery";

let shuttingDown = false;
process.on("SIGTERM", () => { shuttingDown = true; });
process.on("SIGINT", () => { shuttingDown = true; });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await processReportArchives(() => shuttingDown);
  if (shuttingDown) return;
  await deliverDueReports(new Date(), true);
  if (shuttingDown) return;
  await queueCommandSchedules();
  await notifyOutreachFollowups();
  await processOutreachMonitoring(() => shuttingDown);
  await processCommandChecks(undefined, () => shuttingDown);
  if (shuttingDown) return;
  await processResearchJobs(undefined, () => shuttingDown);
  if (shuttingDown) return;
  // Pick up interrupted/manual requests without waiting for the daily provider schedule.
  const scans = await processPlatformJobs(syncDomain);
  console.log(`[orwell-operations] Requested scans: ${scans.completed}/${scans.due} complete, ${scans.failed} failed.`);
  for (const report of scans.reports) for (const result of report.results) if (result.status === "error") console.error(`[orwell-operations] ${report.domainId}/${result.dataset}: ${result.note}`);
  if (shuttingDown) return;
  const reliability = await runReliabilityChecks();
  console.log(`[orwell-operations] Reliability: ${reliability.checked}/${reliability.due} checked, ${reliability.failed} failed.`);
  if (shuttingDown) return;
  const scheduled = await queueDueBrowserCrawls();
  console.log(`[orwell-operations] Browser schedule: ${scheduled.queued} queued across ${scheduled.considered} websites.`);
  const crawls = await processBrowserCrawlJobs(new Date(), () => shuttingDown);
  console.log(`[orwell-operations] Browser crawls: ${crawls.completed}/${crawls.due} complete, ${crawls.failed} failed.`);
  if (shuttingDown) return;
  const local = await processDueLocalSeo();
  console.log(`[orwell-operations] Local SEO: ${local.completed}/${local.attempted} complete, ${local.failed} failed, ${local.due} due.`);
}

main()
  .then(async () => { await closeDb(); process.exit(0); })
  .catch(async (error) => { console.error("[orwell-operations] Fatal error:", error); await closeDb().catch(() => undefined); process.exit(1); });
