import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { syncLocalLocation } from "@/platform/local-seo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  if (!z.string().uuid().safeParse(locationId).success) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "run_scans")) return NextResponse.json({ error: "Run-scan permission required." }, { status: 403 });
    return NextResponse.json({ result: { locationId, status: "completed", costUsd: 0, synthetic: true } });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Local SEO requires DATABASE_URL." }, { status: 503 });
  const [location] = await db().select({ siteSlug: schema.localSeoLocations.siteSlug }).from(schema.localSeoLocations).where(eq(schema.localSeoLocations.id, locationId)).limit(1);
  if (!location || !await canAccessSite(request, location.siteSlug)) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  if (!await hasPermission(request, "run_scans", location.siteSlug)) return NextResponse.json({ error: "Run-scan permission required for this website." }, { status: 403 });
  try {
    return NextResponse.json({ result: await syncLocalLocation(locationId) });
  } catch (error) {
    const status = error instanceof BudgetExceededError || error instanceof DailyLimitError ? 429 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Local scan failed." }, { status });
  }
}
