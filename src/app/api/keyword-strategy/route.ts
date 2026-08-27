import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { hasDatabase } from "@/sync/store";
import { getManagedSite } from "@/platform/site-store";
import { latestKeywordStrategy, refreshKeywordStrategy } from "@/platform/keyword-strategy";
import { qaKeywordStrategy } from "@/data/qa-fixtures";
import { canAccessSite } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site") ?? "mortgagecompare";
  if (!(await getManagedSite(siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json({ strategy: qaKeywordStrategy(siteSlug) });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Keyword strategy requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json({ strategy: await latestKeywordStrategy(siteSlug) });
}

const RefreshSchema = z.object({ siteSlug: z.string().min(1) });

export async function POST(request: Request) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = RefreshSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await getManagedSite(parsed.data.siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ strategy: qaKeywordStrategy(parsed.data.siteSlug), synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Keyword strategy requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json({ strategy: await refreshKeywordStrategy(parsed.data.siteSlug) });
}
