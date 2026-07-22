import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isDomainId } from "@/data/domains";
import { canWrite } from "@/lib/auth";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RecommendationSchema = z.object({
  id: z.string().min(1).max(240),
  title: z.string().min(1).max(500),
  module: z.string().min(1).max(100),
  effort: z.enum(["S", "M", "L"]),
  priorityScore: z.number().int().min(0).max(100),
});

const DecisionSchema = z.object({
  domainId: z.string(),
  action: z.enum(["approve", "dismiss"]),
  recommendation: RecommendationSchema,
});

const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "in_progress", "done"]),
});

function unavailable() {
  return NextResponse.json({ error: "Workflow persistence requires DATABASE_URL." }, { status: 503 });
}

function canMutate(request: Request): boolean {
  return canWrite(request.headers.get("x-orwell-user-role"));
}

export async function GET(request: Request) {
  if (!hasDatabase()) return unavailable();
  const domainId = new URL(request.url).searchParams.get("domain") ?? "";
  if (!isDomainId(domainId)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
  const items = await db()
    .select()
    .from(schema.workflowItems)
    .where(eq(schema.workflowItems.domainSlug, domainId))
    .orderBy(desc(schema.workflowItems.updatedAt));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!hasDatabase()) return unavailable();
  if (!canMutate(request)) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = DecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workflow decision." }, { status: 400 });
  const { domainId, action, recommendation } = parsed.data;
  if (!isDomainId(domainId)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 });

  const now = new Date();
  const values = {
    domainSlug: domainId,
    recommendationKey: recommendation.id,
    decision: action === "approve" ? "approved" : "dismissed",
    title: recommendation.title,
    module: recommendation.module,
    effort: recommendation.effort,
    priorityScore: recommendation.priorityScore,
    status: action === "approve" ? "approved" : null,
    createdBy: request.headers.get("x-orwell-user-email"),
    updatedAt: now,
  };
  const [item] = await db()
    .insert(schema.workflowItems)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.workflowItems.domainSlug, schema.workflowItems.recommendationKey],
      set: { ...values, updatedAt: now },
    })
    .returning();
  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasDatabase()) return unavailable();
  if (!canMutate(request)) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = StatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task status." }, { status: 400 });

  const [item] = await db()
    .update(schema.workflowItems)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(
      and(
        eq(schema.workflowItems.id, parsed.data.id),
        eq(schema.workflowItems.decision, "approved"),
      ),
    )
    .returning();
  if (!item) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ item });
}
