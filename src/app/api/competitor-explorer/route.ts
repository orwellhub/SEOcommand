import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { hasDatabase } from "@/sync/store";
import { getManagedSite } from "@/platform/site-store";
import { exploreCompetitor, recentCompetitorExplorations } from "@/platform/competitive-intelligence";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { qaCompetitorExplorer } from "@/data/qa-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ runs: [{ id: "qa-competitor-run", ...qaCompetitorExplorer() }] });
  if (!hasDatabase()) return NextResponse.json({ error: "Competitor history requires DATABASE_URL." }, { status: 503 });
  const siteSlug = new URL(request.url).searchParams.get("site") ?? "";
  if (!(await getManagedSite(siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  return NextResponse.json({ runs: await recentCompetitorExplorations(siteSlug) });
}

const ExploreSchema = z.object({ siteSlug: z.string().min(1), targetHost: z.string().min(3).max(253) });

export async function POST(request: Request) {
  if (process.env.QA_SYNTHETIC === "true") {
    const body = await request.json().catch(() => ({})) as { targetHost?: string };
    return NextResponse.json({ result: qaCompetitorExplorer(body.targetHost ?? "competitor.example"), synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Competitor explorer requires DATABASE_URL." }, { status: 503 });
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = ExploreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a website and competitor domain." }, { status: 400 });
  try {
    return NextResponse.json({ result: await exploreCompetitor(parsed.data.siteSlug, parsed.data.targetHost) });
  } catch (error) {
    const status = error instanceof BudgetExceededError || error instanceof DailyLimitError ? 429 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Competitor scan failed." }, { status });
  }
}
