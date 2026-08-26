/**
 * Scheduled sync runner (Render cron: `npm run jobs`, daily 06:00 UTC).
 *
 * Split-cadence cost policy (see scheduledTiers):
 *  - Google GSC/GA4 (FREE)                     → every day
 *  - DataForSEO exact tracked rankings         → every day
 *  - DataForSEO keyword/gap/backlink research  → weekly (Mondays)
 *  - DataForSEO OnPage crawls + AI checks      → monthly (1st)
 * Pending OnPage crawls are polled for free on the daily runs, so a monthly
 * crawl still finishes within a day or two. Env overrides: SYNC_GOOGLE=0,
 * SYNC_DFS_LIGHT=1, SYNC_DFS_HEAVY=1 force a tier for a single run.
 *
 * Manual/ad-hoc pulls use POST /api/sync (full pull by default, or ?tier=...).
 */
import { syncAll, syncDomain, scheduledTiers, ALL_TIERS } from "../src/sync/engine";
import { deliverDueReports } from "../src/reports/delivery";
import { processPlatformJobs } from "../src/platform/jobs";
import { deliverQueuedAlerts } from "../src/platform/alert-delivery";
import { closeDb } from "../src/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[orwell-jobs] DATABASE_URL is not set — cannot store snapshots. Aborting.");
    process.exit(1);
  }
  const tiers = scheduledTiers(new Date());
  console.log(
    `[orwell-jobs] Starting scheduled sync — tiers: google=${tiers.google} ` +
      `rankings=${tiers.rankings} dfsLight=${tiers.dfsLight} dfsHeavy=${tiers.dfsHeavy}`,
  );
  const report = await syncAll(tiers);

  for (const d of report.domains) {
    const ok = d.results.filter((r) => r.status === "ok").length;
    const pending = d.results.filter((r) => r.status === "pending").length;
    const errors = d.results.filter((r) => r.status === "error");
    console.log(
      `[orwell-jobs] ${d.domainId}: ${ok} datasets ok, ${pending} pending${
        errors.length ? `, ${errors.length} errors` : ""
      }`,
    );
    for (const e of errors) {
      console.log(`[orwell-jobs]   ✗ ${e.dataset}: ${e.note}`);
    }
  }
  console.log(
    `[orwell-jobs] Complete. ${report.domains.length} domains, ` +
      `${report.startedAt} → ${report.completedAt}.`,
  );

  const onboarding = await processPlatformJobs((siteSlug) => syncDomain(siteSlug, ALL_TIERS));
  console.log(
    `[orwell-jobs] Onboarding: ${onboarding.due} due, ${onboarding.completed} completed, ${onboarding.failed} failed.`,
  );

  const deliveries = await deliverDueReports();
  console.log(
    `[orwell-jobs] Reports: ${deliveries.due} due, ${deliveries.delivered} delivered, ` +
      `${deliveries.failed} failed, ${deliveries.skipped} awaiting webhook configuration.`,
  );
  const alerts = await deliverQueuedAlerts();
  console.log(
    `[orwell-jobs] Alerts: ${alerts.queued} queued, ${alerts.delivered} delivered, ` +
      `${alerts.failed} failed, ${alerts.skipped} awaiting webhook configuration.`,
  );
}

main()
  .then(async () => {
    // Release the Postgres pool, otherwise its open sockets keep the event loop
    // alive and the container idles until the platform reaps it (observed: work
    // done in ~45s, run not marked finished for ~58 minutes).
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[orwell-jobs] Fatal error:", err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
