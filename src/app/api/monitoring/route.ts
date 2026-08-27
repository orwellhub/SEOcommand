import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDatabase } from "@/sync/store";
import { getManagedSite, listManagedSites, listPortfolioGroups, resolveGroupSiteSlugs } from "@/platform/site-store";
import { checkReliability, reliabilityDashboard } from "@/platform/reliability";
import { qaReliability } from "@/data/qa-fixtures";
import { canAccessSite, filterAccessibleSiteSlugs, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveScope(scope: string) {
  if (scope === "portfolio") return (await listManagedSites()).map((site) => site.id);
  if (scope.startsWith("group:")) {
    const groupId = scope.slice(6);
    if (!(await listPortfolioGroups()).some((group) => group.id === groupId)) return null;
    return resolveGroupSiteSlugs(groupId);
  }
  return (await getManagedSite(scope)) ? [scope] : null;
}

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "portfolio";
  const requested = await resolveScope(scope);
  if (!requested) return NextResponse.json({ error: "Scope not found." }, { status: 404 });
  const siteSlugs = await filterAccessibleSiteSlugs(request, requested);
  if (!scope.startsWith("group:") && scope !== "portfolio" && siteSlugs.length === 0) {
    return NextResponse.json({ error: "Website access required." }, { status: 403 });
  }
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json(qaReliability(scope, siteSlugs));
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Reliability history requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json(await reliabilityDashboard(siteSlugs));
}

const CheckSchema = z.object({ siteSlug: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = CheckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a website." }, { status: 400 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "run_scans", parsed.data.siteSlug)) return NextResponse.json({ error: "Run-scan permission required for this website." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ check: { siteSlug: parsed.data.siteSlug, status: "completed", synthetic: true, checkedAt: new Date().toISOString() } });
  if (!hasDatabase()) return NextResponse.json({ error: "Reliability checks require DATABASE_URL." }, { status: 503 });
  const site = await getManagedSite(parsed.data.siteSlug);
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  try {
    return NextResponse.json({ check: await checkReliability(site) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reliability check failed." }, { status: 502 });
  }
}
