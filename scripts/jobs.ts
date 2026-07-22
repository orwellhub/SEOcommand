/**
 * Scheduled sync runner (Render cron: `npm run jobs`, daily 06:00 UTC — and the
 * "Trigger Run" button for on-demand syncs).
 *
 * Runs the sync engine across every domain in the registry: DataForSEO
 * intelligence + first-party GSC/GA4, written as canonical snapshots that the
 * dashboard serves via /api/live. Idempotent per day, budget-guarded, and
 * OnPage crawls resume across runs via stored task ids.
 *
 * Crawl policy: a domain with no completed crawl always crawls; otherwise
 * crawls run on Sundays (weekly cadence) or when SYNC_INCLUDE_CRAWL=1.
 */
import { syncAll } from "../src/sync/engine";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[orwell-jobs] DATABASE_URL is not set — cannot store snapshots. Aborting.");
    process.exit(1);
  }
  const isSunday = new Date().getUTCDay() === 0;
  const includeCrawl = process.env.SYNC_INCLUDE_CRAWL === "1" || isSunday || undefined;
  // `undefined` lets the engine crawl any domain that has never been crawled.

  console.log(
    `[orwell-jobs] Starting full sync — crawls: ${includeCrawl ? "yes" : "auto (first-time only)"}`,
  );
  const report = await syncAll({ includeCrawl });

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
    for (const s of d.results.filter((r) => r.status === "skipped" && r.note)) {
      console.log(`[orwell-jobs]   ⤺ ${s.dataset}: ${s.note}`);
    }
  }
  console.log(
    `[orwell-jobs] Complete. ${report.domains.length} domains, ` +
      `${report.startedAt} → ${report.completedAt}.`,
  );
}

main().catch((err) => {
  console.error("[orwell-jobs] Fatal error:", err);
  process.exit(1);
});
