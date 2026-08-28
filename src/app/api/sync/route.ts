import { NextResponse } from "next/server";
import { isManagedSite } from "@/platform/site-store";
import { syncAll, syncDomain, ALL_TIERS, type SyncTiers } from "@/sync/engine";
import { hasDatabase } from "@/sync/store";

/**
 * Manual-pull tier selection. Default (no `tier`) is a deliberate FULL pull —
 * a human triggering this wants everything for that scope. Presets:
 *   tier=google → free GSC/GA4 only
 *   tier=light  → Google + DataForSEO keywords/rankings/backlinks (no crawl/AI)
 *   tier=full   → everything (default)
 */
function resolveTiers(tier: string | null): SyncTiers {
  switch (tier) {
    case "google":
      return { google: true, rankings: false, dfsLight: false, dfsHeavy: false, ai: false, dedupePaid: false, dfsLightModules: [] };
    case "light":
      return { google: true, rankings: true, dfsLight: true, dfsHeavy: false, ai: false, dedupePaid: false, dfsLightModules: null };
    case "full":
    case null:
      return ALL_TIERS;
    default:
      return ALL_TIERS;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual sync trigger. Protected: requires `Authorization: Bearer <SYNC_TOKEN>`
 * and refuses entirely when SYNC_TOKEN is unset — syncing spends provider
 * budget, so it must never be publicly triggerable.
 *
 *   POST /api/sync                        → full portfolio pull (all tiers)
 *   POST /api/sync?domain=<id>            → one property, full pull
 *   POST /api/sync?domain=<id>&tier=light → one property, no crawl/AI (cheaper)
 *   POST /api/sync?tier=google            → free GSC/GA4 refresh only
 *
 * The daily cron (orwell-jobs) runs the split-cadence schedule automatically;
 * this route is for deliberate on-demand refresh. Long full portfolio pulls are
 * better run via the cron's "Trigger Run" to avoid HTTP timeouts.
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
  const tiers = resolveTiers(url.searchParams.get("tier"));

  try {
    if (domain) {
      if (!(await isManagedSite(domain))) {
        return NextResponse.json({ error: `Unknown domain "${domain}"` }, { status: 404 });
      }
      const report = await syncDomain(domain, tiers);
      return NextResponse.json({ tiers, ...report });
    }
    const report = await syncAll(tiers);
    return NextResponse.json({ tiers, ...report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
