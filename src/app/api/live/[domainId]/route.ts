import { NextResponse } from "next/server";
import { isManagedSite } from "@/platform/site-store";
import { buildDomainBundle } from "@/sync/bundle";
import { canAccessSite } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Latest live snapshot bundle for one domain (canonical models + provenance). */
export async function GET(request: Request, { params }: { params: Promise<{ domainId: string }> }) {
  const { domainId } = await params;
  if (!(await isManagedSite(domainId))) {
    return NextResponse.json({ error: `Unknown domain "${domainId}"` }, { status: 404 });
  }
  if (!await canAccessSite(request, domainId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  try {
    const bundle = await buildDomainBundle(domainId);
    return NextResponse.json(bundle);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build bundle" },
      { status: 500 },
    );
  }
}
