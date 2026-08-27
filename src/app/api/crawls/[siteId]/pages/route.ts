import { NextResponse } from "next/server";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { isManagedSite } from "@/platform/site-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!hasDatabase()) return NextResponse.json({ run: null, pages: [], total: 0 });
  if (!(await isManagedSite(siteId))) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(search.get("limit")) || 100, 1), 500);
  const offset = Math.max(Number(search.get("offset")) || 0, 0);
  const query = search.get("q")?.trim();
  const status = Number(search.get("status"));
  const [run] = await db().select().from(schema.detailedCrawlRuns).where(eq(schema.detailedCrawlRuns.siteSlug, siteId)).orderBy(desc(schema.detailedCrawlRuns.startedAt)).limit(1);
  if (!run) return NextResponse.json({ run: null, pages: [], total: 0 });
  const filter = and(
    eq(schema.detailedCrawlPages.runId, run.id),
    query ? ilike(schema.detailedCrawlPages.url, `%${query}%`) : undefined,
    Number.isInteger(status) && status > 0 ? eq(schema.detailedCrawlPages.statusCode, status) : undefined,
  );
  const [pages, count] = await Promise.all([
    db().select().from(schema.detailedCrawlPages).where(filter).orderBy(schema.detailedCrawlPages.url).limit(limit).offset(offset),
    db().select({ total: sql<number>`count(*)::int` }).from(schema.detailedCrawlPages).where(filter),
  ]);
  return NextResponse.json({ run, pages, total: count[0]?.total ?? 0, limit, offset });
}
