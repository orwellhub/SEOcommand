import { NextResponse } from "next/server";
import { probeDataForSeo } from "@/providers/dataforseo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Go-live health probe. Confirms DataForSEO credentials work (a zero-cost models
 * call), returns the current monthly-spend guardrail status, and never exposes
 * secrets. Use this after entering credentials in Render to verify the account
 * before running a paid sync.
 */
export async function GET() {
  const probe = await probeDataForSeo();
  return NextResponse.json({
    provider: "dataforseo",
    ...probe,
  });
}
