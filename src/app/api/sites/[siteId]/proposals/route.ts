import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { isManagedSite } from "@/platform/site-store";
import { canAccessSite } from "@/platform/access";

const Schema = z.object({
  connectionId: z.string().uuid(),
  title: z.string().min(3).max(240),
  summary: z.string().min(3).max(2000),
  changes: z.record(z.unknown()).default({}),
});

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!await canAccessSite(request, siteId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ items: [] });
  if (!(await isManagedSite(siteId))) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const items = await db().select().from(schema.siteChangeProposals).where(eq(schema.siteChangeProposals.siteSlug, siteId)).orderBy(desc(schema.siteChangeProposals.createdAt));
  return NextResponse.json({ items });
}

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!await canAccessSite(request, siteId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  if (!(await isManagedSite(siteId))) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid change proposal." }, { status: 400 });
  const [connection] = await db().select().from(schema.siteConnections).where(eq(schema.siteConnections.id, parsed.data.connectionId)).limit(1);
  if (!connection || connection.siteSlug !== siteId) return NextResponse.json({ error: "Connection not found for this site." }, { status: 404 });
  const [item] = await db().insert(schema.siteChangeProposals).values({
    siteSlug: siteId,
    connectionId: connection.id,
    title: parsed.data.title,
    summary: parsed.data.summary,
    changes: { ...parsed.data.changes, publishMode: "review_only" },
    status: "draft",
    createdBy: request.headers.get("x-orwell-user-email"),
  }).returning();
  return NextResponse.json({ item, publishMode: "review_only" }, { status: 201 });
}
