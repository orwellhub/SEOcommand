import { NextResponse } from "next/server";
import { isManagedSite } from "@/platform/site-store";
import { buildDomainBundle } from "@/sync/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Latest live snapshot bundle for one domain (canonical models + provenance). */
export async function GET(_req: Request, { params }: { params: { domainId: string } }) {
  const { domainId } = params;
  if (!(await isManagedSite(domainId))) {
    return NextResponse.json({ error: `Unknown domain "${domainId}"` }, { status: 404 });
  }
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
