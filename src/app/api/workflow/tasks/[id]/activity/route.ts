import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().uuid() });
const CommentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

async function resolveItem(request: Request, params: Promise<{ id: string }>) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return null;
  const [item] = await db().select().from(schema.workflowItems).where(eq(schema.workflowItems.id, parsed.data.id)).limit(1);
  if (!item || !await canAccessSite(request, item.domainSlug)) return null;
  return item;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ comments: [], history: [], synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Workflow activity requires DATABASE_URL." }, { status: 503 });
  const item = await resolveItem(request, params);
  if (!item) return NextResponse.json({ error: "Execution item access required." }, { status: 403 });
  const [comments, history] = await Promise.all([
    db().select().from(schema.workflowComments).where(eq(schema.workflowComments.workflowItemId, item.id)).orderBy(asc(schema.workflowComments.createdAt)).limit(200),
    db().select().from(schema.workflowStatusHistory).where(eq(schema.workflowStatusHistory.workflowItemId, item.id)).orderBy(desc(schema.workflowStatusHistory.createdAt)).limit(200),
  ]);
  return NextResponse.json({ comments, history });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = CommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a comment between 1 and 2,000 characters." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ comment: { id: "73000000-0000-4000-8000-000000000001", body: parsed.data.body, actorEmail: request.headers.get("x-orwell-user-email"), createdAt: new Date().toISOString() }, synthetic: true }, { status: 201 });
  if (!hasDatabase()) return NextResponse.json({ error: "Workflow activity requires DATABASE_URL." }, { status: 503 });
  const item = await resolveItem(request, params);
  if (!item) return NextResponse.json({ error: "Execution item access required." }, { status: 403 });
  if (!await hasPermission(request, "manage_content", item.domainSlug)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });
  const actor = request.headers.get("x-orwell-user-email");
  const [comment] = await db().insert(schema.workflowComments).values({ workflowItemId: item.id, actorEmail: actor, body: parsed.data.body }).returning();
  return NextResponse.json({ comment }, { status: 201 });
}
