/** Process only an already queued browser crawl for the explicitly supplied website. */
import { closeDb } from "../src/db";
import { processBrowserCrawlJobs } from "../src/platform/operational-jobs";
import { getManagedSite } from "../src/platform/site-store";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
  const [siteSlug, ...extra] = process.argv.slice(2);
  if (!siteSlug || extra.length || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(siteSlug)) throw new Error("Usage: tsx scripts/crawl-one-site.ts <website-slug>");
  if (!await getManagedSite(siteSlug)) throw new Error("Website not found.");
  const result = await processBrowserCrawlJobs(new Date(), () => stopping, siteSlug);
  console.log(`[single-site-crawl] ${siteSlug}: ${JSON.stringify(result)}`);
  if (!result.due || result.failed || !result.completed) process.exitCode = 1;
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(closeDb);
