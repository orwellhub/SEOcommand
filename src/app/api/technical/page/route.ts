import { NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite } from "@/platform/access";
import { qaBrowserCrawl } from "@/data/qa-fixtures";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams, site = p.get("site") ?? "", url = p.get("url") ?? "", run = p.get("run");
  if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!z.string().url().safeParse(url).success || (run && !z.string().uuid().safeParse(run).success)) return NextResponse.json({ error: "Choose a valid page and crawl." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") { const data = qaBrowserCrawl(site); const page = data.pages.find(row => row.url === url); return page ? NextResponse.json({ page, run: data.run, incoming: [], outgoing: [], resources: null, history: [page], synthetic: true }) : NextResponse.json({ error: "Page not found." }, { status: 404 }); }
  const pages = schema.browserCrawlPages;
  const [page] = await db().select().from(pages).where(and(eq(pages.siteSlug, site), eq(pages.url, url), run ? eq(pages.runId, run) : undefined)).orderBy(desc(pages.capturedAt)).limit(1);
  if (!page) return NextResponse.json({ error: "No saved rendered evidence for this URL." }, { status: 404 });
  const edges = schema.browserCrawlEdges;
  const [runs, links, resources, history] = await Promise.all([
    db().select().from(schema.browserCrawlRuns).where(eq(schema.browserCrawlRuns.id, page.runId)).limit(1),
    db().select().from(edges).where(and(eq(edges.siteSlug, site), eq(edges.runId, page.runId), or(eq(edges.sourceUrl, url), eq(edges.targetUrl, url)))).limit(1001),
    db().select({ payload: schema.commandRecords.payload }).from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, site), eq(schema.commandRecords.kind, "workspace_crawl_resources"), sql`${schema.commandRecords.payload}->>'runId' = ${page.runId}`, sql`${schema.commandRecords.payload}->>'url' = ${url}`)).limit(1),
    db().select({ id: pages.id, runId: pages.runId, statusCode: pages.statusCode, renderedTitle: pages.renderedTitle, canonical: pages.canonical, issues: pages.issues, capturedAt: pages.capturedAt }).from(pages).where(and(eq(pages.siteSlug, site), eq(pages.url, url))).orderBy(desc(pages.capturedAt)).limit(20),
  ]);
  return NextResponse.json({ page, run: runs[0], incoming: links.slice(0, 1000).filter(e => e.targetUrl === url), outgoing: links.slice(0, 1000).filter(e => e.sourceUrl === url), linksTruncated: links.length > 1000, resources: resources.find(r => r.payload.runId === page.runId && r.payload.url === url)?.payload ?? null, history });
}
