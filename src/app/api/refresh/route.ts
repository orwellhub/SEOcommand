import { NextResponse } from "next/server";
import { isManagedSite } from "@/platform/site-store";
import { canWrite } from "@/lib/auth";
import { syncAll, syncDomain, type SyncTiers } from "@/sync/engine";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Dashboard-triggered refresh.
 *
 * Distinct from /api/sync, which is machine-to-machine and needs a bearer
 * SYNC_TOKEN a browser must never hold. This route authorises off the signed
 * session cookie (via the middleware's x-orwell-user-role header) so the
 * in-app refresh buttons work, and still refuses to run for read-only roles.
 *
 *   POST /api/refresh { source: "google" }      → free GSC + GA4 pull
 *   POST /api/refresh { source: "dataforseo" }  → paid DataForSEO pull
 *   ...with optional { domainId } to refresh a single property.
 *
 * "dataforseo" runs the LIGHT tier (keywords, rankings, competitors, backlinks)
 * — it deliberately excludes site crawls and AI checks, which are the expensive
 * monthly tier. Every call still passes through the $200/month SpendGuard.
 */

export type RefreshSource = "google" | "dataforseo";

const TIERS: Record<RefreshSource, SyncTiers> = {
  google: { google: true, rankings: false, dfsLight: false, dfsHeavy: false },
  dataforseo: { google: false, rankings: true, dfsLight: true, dfsHeavy: false },
};

interface Body {
  source?: string;
  domainId?: string | null;
}

export async function POST(request: Request) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) {
    return NextResponse.json(
      { error: "Your role does not permit triggering a refresh." },
      { status: 403 },
    );
  }
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "Refresh requires DATABASE_URL to store the results." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const source = body.source;
  if (source !== "google" && source !== "dataforseo") {
    return NextResponse.json(
      { error: 'source must be "google" or "dataforseo".' },
      { status: 400 },
    );
  }
  const tiers = TIERS[source];

  const domainId = body.domainId && body.domainId !== "portfolio" ? body.domainId : null;
  if (domainId && !(await isManagedSite(domainId))) {
    return NextResponse.json({ error: `Unknown domain "${domainId}".` }, { status: 404 });
  }

  const startedAt = Date.now();
  try {
    const report = domainId
      ? { domains: [await syncDomain(domainId, tiers)] }
      : await syncAll(tiers);
    return NextResponse.json({
      ok: true,
      source,
      scope: domainId ?? "portfolio",
      elapsedMs: Date.now() - startedAt,
      report,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        source,
        error: err instanceof Error ? err.message : "Refresh failed.",
      },
      { status: 500 },
    );
  }
}
