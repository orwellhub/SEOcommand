import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { hasDatabase } from "@/sync/store";
import { getManagedSite } from "@/platform/site-store";
import { latestBrowserCrawl, queueBrowserCrawl } from "@/platform/advanced-crawler";
import { qaBrowserCrawl } from "@/data/qa-fixtures";
import { canAccessSite } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site") ?? "mortgagecompare";
  if (!(await getManagedSite(siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json(qaBrowserCrawl(siteSlug));
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Browser crawl history requires DATABASE_URL." }, { status: 503 });
  if (!(await getManagedSite(siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  return NextResponse.json(await latestBrowserCrawl(siteSlug));
}

const QueueSchema = z.object({ siteSlug: z.string().min(1), maxPages: z.number().int().min(1).max(5_000).optional() });

export async function POST(request: Request) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = QueueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a website and a valid page limit." }, { status: 400 });
  if (!(await getManagedSite(parsed.data.siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ job: { id: "qa-browser-crawl", status: "queued", synthetic: true } }, { status: 202 });
  if (!hasDatabase()) return NextResponse.json({ error: "Browser crawl queue requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json({ job: await queueBrowserCrawl(parsed.data.siteSlug, parsed.data.maxPages) }, { status: 202 });
}
