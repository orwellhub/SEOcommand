import { NextResponse } from "next/server";
import { buildAggregateBundle } from "@/sync/bundle";
import { resolveGroupSiteSlugs } from "@/platform/site-store";
import { accessibleSiteSlugs } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Portfolio-wide live bundle — every domain's latest snapshots merged into a
 * single bundle shaped like a domain bundle. Backs the "Portfolio" scope so
 * module pages show combined data instead of one domain's.
 */
export async function GET(request: Request) {
  try {
    const groupId = new URL(request.url).searchParams.get("groupId");
    const requested = groupId ? await resolveGroupSiteSlugs(groupId) : null;
    const accessible = await accessibleSiteSlugs(request);
    const slugs = accessible === null
      ? requested ?? undefined
      : (requested ?? accessible).filter((slug) => accessible.includes(slug));
    const bundle = await buildAggregateBundle(slugs);
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build portfolio bundle" },
      { status: 500 },
    );
  }
}
