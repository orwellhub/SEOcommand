import { NextResponse } from "next/server";
import { buildAggregateBundle } from "@/sync/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Portfolio-wide live bundle — every domain's latest snapshots merged into a
 * single bundle shaped like a domain bundle. Backs the "Portfolio" scope so
 * module pages show combined data instead of one domain's.
 */
export async function GET() {
  try {
    const bundle = await buildAggregateBundle();
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build portfolio bundle" },
      { status: 500 },
    );
  }
}
