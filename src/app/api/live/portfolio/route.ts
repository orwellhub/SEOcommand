import { NextResponse } from "next/server";
import { buildPortfolio } from "@/sync/bundle";
import { resolveGroupSiteSlugs } from "@/platform/site-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Portfolio headline aggregates from stored live snapshots. */
export async function GET(request: Request) {
  try {
    const groupId = new URL(request.url).searchParams.get("groupId");
    const portfolio = await buildPortfolio(groupId ? await resolveGroupSiteSlugs(groupId) : undefined);
    return NextResponse.json(portfolio);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build portfolio" },
      { status: 500 },
    );
  }
}
