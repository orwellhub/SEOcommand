import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { isManagedSite } from "@/platform/site-store";
import { canAccessSite, hasPermission } from "@/platform/access";

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

export async function GET(request: Request) {
  const domainId = new URL(request.url).searchParams.get("domain") ?? "";
  if (!await isManagedSite(domainId)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
  if (!await canAccessSite(request, domainId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json({
      items: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          domainSlug: domainId,
          recommendationKey: `${domainId}-rec-1`,
          decision: "approved",
          title: "Resolve high-impact indexability change",
          module: "Technical",
          effort: "S",
          priorityScore: 86,
          status: "in_progress",
          createdBy: "qa@orwell.local",
          updatedAt: "2026-08-26T08:00:00.000Z",
        },
      ],
      synthetic: true,
    });
  }
  if (!hasDatabase()) return unavailable();
  const items = await db()
    .select()
    .from(schema.workflowItems)
    .where(eq(schema.workflowItems.domainSlug, domainId))
    .orderBy(desc(schema.workflowItems.updatedAt));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const parsed = DecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workflow decision." }, { status: 400 });
  const { domainId, action, recommendation } = parsed.data;
  if (!await isManagedSite(domainId)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
  if (!await canAccessSite(request, domainId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "manage_content", domainId)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json({
      item: {
        id: "60000000-0000-4000-8000-000000000099",
        domainSlug: domainId,
        recommendationKey: recommendation.id,
        decision: action === "approve" ? "approved" : "dismissed",
        title: recommendation.title,
        module: recommendation.module,
        effort: recommendation.effort,
        priorityScore: recommendation.priorityScore,
        status: action === "approve" ? "approved" : null,
        createdBy: request.headers.get("x-orwell-user-email"),
        updatedAt: new Date().toISOString(),
      },
      synthetic: true,
    }, { status: 201 });
  }
  if (!hasDatabase()) return unavailable();

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
  const parsed = StatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task status." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Workflow permission required." }, { status: 403 });
    return NextResponse.json({ item: { ...parsed.data, synthetic: true } });
  }
  if (!hasDatabase()) return unavailable();
  const [current] = await db().select({ domainSlug: schema.workflowItems.domainSlug })
    .from(schema.workflowItems).where(eq(schema.workflowItems.id, parsed.data.id)).limit(1);
  if (!current || !await canAccessSite(request, current.domainSlug)) {
    return NextResponse.json({ error: "Task access required." }, { status: 403 });
  }
  if (!await hasPermission(request, "manage_content", current.domainSlug)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });

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
