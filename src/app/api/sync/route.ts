import { NextResponse } from "next/server";
import { isDomainId } from "@/data/domains";
import { syncAll, syncDomain } from "@/sync/engine";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual sync trigger. Protected: requires `Authorization: Bearer <SYNC_TOKEN>`
 * and refuses entirely when SYNC_TOKEN is unset — syncing spends provider
 * budget, so it must never be publicly triggerable.
 *
 *   POST /api/sync                 → full portfolio sync (no crawls)
 *   POST /api/sync?domain=<id>     → one domain
 *   POST /api/sync?crawl=1         → include OnPage crawls
 *
 * The daily cron (orwell-jobs) runs the same engine on schedule; this route is
 * for on-demand refresh. Long full syncs are better run via the cron's
 * "Trigger Run" to avoid HTTP timeouts.
 */
export async function POST(req: Request) {
  const token = process.env.SYNC_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  const includeCrawl = url.searchParams.get("crawl") === "1";

  try {
    if (domain) {
      if (!isDomainId(domain)) {
        return NextResponse.json({ error: `Unknown domain "${domain}"` }, { status: 404 });
      }
      const report = await syncDomain(domain, { includeCrawl });
      return NextResponse.json(report);
    }
    const report = await syncAll({ includeCrawl });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
