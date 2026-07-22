import { NextResponse } from "next/server";
import { probeGoogle } from "@/providers/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Go-live health probe for the first-party Google connection. Verifies the
 * headless credentials by listing Search Console properties (read-only) and
 * reports the configured GSC site / GA4 property mappings. Never exposes secrets.
 */
export async function GET() {
  const probe = await probeGoogle();
  return NextResponse.json({ provider: "google", ...probe });
}
