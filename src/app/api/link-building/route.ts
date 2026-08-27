import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDatabase } from "@/sync/store";
import { getManagedSite } from "@/platform/site-store";
import { discoverLinkGapProspects } from "@/platform/competitive-intelligence";
import { linkBuildingDashboard } from "@/platform/link-outreach";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { qaLinkBuilding } from "@/data/qa-fixtures";
import { canAccessSite, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim();
  if (!siteSlug) return NextResponse.json({ error: "Choose a website first." }, { status: 400 });
  if (!(await getManagedSite(siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json(qaLinkBuilding(siteSlug));
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Link workflow requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json(await linkBuildingDashboard(siteSlug));
}

const DiscoverSchema = z.object({ siteSlug: z.string().min(1), competitors: z.array(z.string().min(3)).min(1).max(10) });

export async function POST(request: Request) {
  const parsed = DiscoverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add between one and ten competitor domains." }, { status: 400 });
  if (!(await getManagedSite(parsed.data.siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "run_scans", parsed.data.siteSlug)) return NextResponse.json({ error: "Run-scan permission required for this website." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ prospects: qaLinkBuilding(parsed.data.siteSlug).prospects, synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Link workflow requires DATABASE_URL." }, { status: 503 });
  try {
    return NextResponse.json({ prospects: await discoverLinkGapProspects(parsed.data.siteSlug, parsed.data.competitors) });
  } catch (error) {
    const status = error instanceof BudgetExceededError || error instanceof DailyLimitError ? 429 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Link gap scan failed." }, { status });
  }
}
