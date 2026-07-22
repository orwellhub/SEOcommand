import { NextResponse } from "next/server";
import { buildPortfolio } from "@/sync/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Portfolio headline aggregates from stored live snapshots. */
export async function GET() {
  try {
    const portfolio = await buildPortfolio();
    return NextResponse.json(portfolio);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build portfolio" },
      { status: 500 },
    );
  }
}
