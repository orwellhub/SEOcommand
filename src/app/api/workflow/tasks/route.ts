import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { isManagedSite } from "@/platform/site-store";
import { accessibleSiteSlugs, canAccessSite, hasPermission } from "@/platform/access";
import { sessionFromRequest } from "@/lib/auth";
import { EXECUTION_TYPES, PAGE_MODES, WORKFLOW_STATUSES } from "@/platform/opportunity-bridge";
import { captureBaseline, recordShipment, type VerificationState } from "@/platform/workflow-verification";

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

const DirectWorkSchema = z.object({
  siteSlug: z.string().min(1).max(120),
  findingKey: z.string().min(1).max(240),
  title: z.string().trim().min(3).max(500),
  module: z.string().trim().min(1).max(100),
  executionType: z.enum(EXECUTION_TYPES),
  priorityScore: z.number().int().min(0).max(100),
  pageMode: z.enum(PAGE_MODES),
  targetUrl: z.string().trim().max(1000).nullable().optional(),
  plannedUrl: z.string().trim().max(1000).nullable().optional(),
  targetKeywords: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  ownerEmail: z.string().trim().email().max(320),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUrl: z.string().trim().startsWith("/").max(1000),
  sourceEvidence: z.record(z.string(), z.unknown()),
}).superRefine((input, context) => {
  if (input.pageMode === "existing_page" && !input.targetUrl) context.addIssue({ code: "custom", path: ["targetUrl"], message: "Choose the affected page." });
  if (input.pageMode === "new_page" && !input.plannedUrl) context.addIssue({ code: "custom", path: ["plannedUrl"], message: "Add the planned URL or path." });
});

const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(WORKFLOW_STATUSES),
  note: z.string().trim().max(500).optional(),
});

const AssignmentSchema = z.object({
  id: z.string().uuid(),
  ownerEmail: z.string().trim().email().max(320),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function unavailable() {
  return NextResponse.json({ error: "Workflow persistence requires DATABASE_URL." }, { status: 503 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domainId = url.searchParams.get("domain")?.trim() ?? "";
  const mine = url.searchParams.get("mine") === "true";
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (domainId && !await isManagedSite(domainId)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
  if (domainId && !await canAccessSite(request, domainId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json({
      items: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          domainSlug: domainId || "qa-site-1",
          recommendationKey: `${domainId || "qa-site-1"}-rec-1`,
          decision: "approved",
          title: "Resolve high-impact indexability change",
          module: "Technical",
          effort: "S",
          priorityScore: 86,
          status: "in_progress",
          executionType: "content_brief",
          ownerEmail: session.email,
          dueDate: "2026-09-10",
          pageMode: "new_page",
          plannedUrl: "/guides/high-impact-indexability",
          createdBy: "qa@orwell.local",
          updatedAt: "2026-08-26T08:00:00.000Z",
        },
      ],
      synthetic: true,
    });
  }
  if (!hasDatabase()) return unavailable();
  const granted = domainId ? [domainId] : await accessibleSiteSlugs(request);
  if (granted?.length === 0) return NextResponse.json({ items: [] });
  const conditions = [
    domainId ? eq(schema.workflowItems.domainSlug, domainId) : granted ? inArray(schema.workflowItems.domainSlug, granted) : undefined,
    mine ? eq(schema.workflowItems.ownerEmail, session.email.toLowerCase()) : undefined,
    domainId ? undefined : eq(schema.workflowItems.decision, "approved"),
  ].filter(Boolean);
  const items = await db()
    .select()
    .from(schema.workflowItems)
    .where(and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
    .orderBy(desc(schema.workflowItems.updatedAt));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  const direct = DirectWorkSchema.safeParse(input);
  const parsed = DecisionSchema.safeParse(input);
  if (!parsed.success && !direct.success) return NextResponse.json({ error: "Complete the execution details." }, { status: 400 });

  if (direct.success) {
    const work = direct.data;
    if (!await isManagedSite(work.siteSlug)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
    if (!await canAccessSite(request, work.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
    if (!await hasPermission(request, "manage_content", work.siteSlug)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });
    const actor = request.headers.get("x-orwell-user-email");
    if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ item: { id: "60000000-0000-4000-8000-000000000088", domainSlug: work.siteSlug, recommendationKey: `finding:${work.findingKey}`, decision: "approved", status: "approved", effort: "M", ...work, createdBy: actor, updatedAt: new Date().toISOString() }, synthetic: true }, { status: 201 });
    if (!hasDatabase()) return unavailable();
    const now = new Date();
    const result = await db().transaction(async (tx) => {
      const [created] = await tx.insert(schema.workflowItems).values({
        domainSlug: work.siteSlug,
        recommendationKey: `finding:${work.findingKey}`,
        decision: "approved",
        title: work.title,
        module: work.module,
        effort: "M",
        priorityScore: work.priorityScore,
        status: "approved",
        sourceUrl: work.sourceUrl,
        sourceEvidence: work.sourceEvidence,
        executionType: work.executionType,
        ownerEmail: work.ownerEmail.toLowerCase(),
        dueDate: work.dueDate,
        pageMode: work.pageMode,
        targetUrl: work.pageMode === "existing_page" ? work.targetUrl : null,
        plannedUrl: work.pageMode === "new_page" ? work.plannedUrl : null,
        executionData: { targetKeywords: work.targetKeywords },
        createdBy: actor,
        updatedAt: now,
      }).onConflictDoNothing().returning();
      if (created) {
        await tx.insert(schema.workflowStatusHistory).values({ workflowItemId: created.id, fromStatus: null, toStatus: "approved", changedBy: actor, note: `Created from a ${work.module.toLowerCase()} finding.` });
        await tx.insert(schema.accessAuditEvents).values({ siteSlug: work.siteSlug, actorEmail: actor, actorRole: request.headers.get("x-orwell-user-role"), action: "workflow.finding_created", area: "workflow", summary: `Created approved work: ${work.title}`, metadata: { findingKey: work.findingKey, executionType: work.executionType, sourceUrl: work.sourceUrl } });
        return { item: created, existing: false };
      }
      const [existing] = await tx.select().from(schema.workflowItems).where(and(eq(schema.workflowItems.domainSlug, work.siteSlug), eq(schema.workflowItems.recommendationKey, `finding:${work.findingKey}`))).limit(1);
      return { item: existing, existing: true };
    });
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  }

  const { domainId, action, recommendation } = parsed.data!;
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
  const input = await request.json().catch(() => null);
  const statusParsed = StatusSchema.safeParse(input);
  const assignmentParsed = AssignmentSchema.safeParse(input);
  if (!statusParsed.success && !assignmentParsed.success) return NextResponse.json({ error: "Invalid workflow update." }, { status: 400 });
  const assignment = assignmentParsed.success ? assignmentParsed.data : null;
  const id = statusParsed.success ? statusParsed.data.id : assignment!.id;
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Workflow permission required." }, { status: 403 });
    return NextResponse.json({ item: { ...(statusParsed.success ? statusParsed.data : assignment!), synthetic: true } });
  }
  if (!hasDatabase()) return unavailable();
  const [current] = await db().select({ domainSlug: schema.workflowItems.domainSlug, status: schema.workflowItems.status, executionType: schema.workflowItems.executionType, sourceEvidence: schema.workflowItems.sourceEvidence, verification: schema.workflowItems.verification, targetUrl: schema.workflowItems.targetUrl })
    .from(schema.workflowItems).where(eq(schema.workflowItems.id, id)).limit(1);
  if (!current || !await canAccessSite(request, current.domainSlug)) {
    return NextResponse.json({ error: "Task access required." }, { status: 403 });
  }
  if (!await hasPermission(request, "manage_content", current.domainSlug)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });

  const actor = request.headers.get("x-orwell-user-email");
  const now = new Date();
  const item = await db().transaction(async (tx) => {
    if (statusParsed.success) {
      const next = statusParsed.data.status;
      const order = WORKFLOW_STATUSES as readonly string[];
      const fromIndex = order.indexOf(current.status ?? "approved");
      const toIndex = order.indexOf(next);
      if (current.executionType && toIndex !== fromIndex && toIndex !== fromIndex + 1) throw new Error("Move execution work through each lifecycle stage in order.");
      let verification = current.verification as VerificationState;
      if (next === "in_progress" && !verification.baseline) verification = captureBaseline(current.sourceEvidence, now);
      if (next === "shipped" && !verification.shipment) verification = recordShipment(verification, { note: statusParsed.data.note, url: current.targetUrl }, now);
      const [updated] = await tx.update(schema.workflowItems).set({
        status: next,
        verification,
        shippedAt: next === "shipped" ? now : undefined,
        verifiedAt: next === "done" ? now : undefined,
        updatedAt: now,
      }).where(and(eq(schema.workflowItems.id, id), eq(schema.workflowItems.decision, "approved"))).returning();
      if (updated && current.status !== next) await tx.insert(schema.workflowStatusHistory).values({ workflowItemId: id, fromStatus: current.status, toStatus: next, changedBy: actor, note: statusParsed.data.note });
      return updated;
    }
    const [updated] = await tx.update(schema.workflowItems).set({ ownerEmail: assignment!.ownerEmail.toLowerCase(), dueDate: assignment!.dueDate, updatedAt: now })
      .where(and(eq(schema.workflowItems.id, id), eq(schema.workflowItems.decision, "approved"))).returning();
    return updated;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("Move execution work")) return null;
    throw error;
  });
  if (!item && statusParsed.success && current.executionType) return NextResponse.json({ error: "Move execution work through each lifecycle stage in order." }, { status: 409 });
  if (!item) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ item });
}
