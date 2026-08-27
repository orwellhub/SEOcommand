import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { accessibleSiteSlugs, canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MapSchema = z.object({
  evidenceId: z.string().uuid(),
  siteSlug: z.string().min(1).max(120),
  title: z.string().min(3).max(300),
  notes: z.string().max(2000).nullable().optional(),
  priorityScore: z.number().int().min(0).max(100),
});
const ReviewSchema = z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject"]) });

export async function GET(request: Request) {
  if (!await hasPermission(request, "research")) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
  const evidenceId = new URL(request.url).searchParams.get("evidence")?.trim();
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ mappings: [], synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Research mapping requires DATABASE_URL." }, { status: 503 });
  const granted = await accessibleSiteSlugs(request);
  if (granted?.length === 0) return NextResponse.json({ mappings: [] });
  const conditions = [evidenceId ? eq(schema.researchMappings.evidenceId, evidenceId) : undefined, granted ? inArray(schema.researchMappings.siteSlug, granted) : undefined].filter(Boolean);
  const mappings = await db().select().from(schema.researchMappings)
    .where(conditions.length ? and(...conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]) : undefined)
    .orderBy(desc(schema.researchMappings.updatedAt)).limit(100);
  return NextResponse.json({ mappings });
}

export async function POST(request: Request) {
  const parsed = MapSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the website mapping details." }, { status: 400 });
  const input = parsed.data;
  if (!(await getManagedSite(input.siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, input.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "research", input.siteSlug)) return NextResponse.json({ error: "Research permission required for this website." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ mapping: { id: "72000000-0000-4000-8000-000000000001", ...input, status: "mapped", createdBy: request.headers.get("x-orwell-user-email"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, synthetic: true }, { status: 201 });
  if (!hasDatabase()) return NextResponse.json({ error: "Research mapping requires DATABASE_URL." }, { status: 503 });
  const [evidence] = await db().select({ id: schema.researchEvidence.id }).from(schema.researchEvidence).where(eq(schema.researchEvidence.id, input.evidenceId)).limit(1);
  if (!evidence) return NextResponse.json({ error: "Research evidence not found." }, { status: 404 });
  const values = { evidenceId: input.evidenceId, siteSlug: input.siteSlug, title: input.title, notes: input.notes ?? null, priorityScore: input.priorityScore, status: "mapped", createdBy: request.headers.get("x-orwell-user-email"), updatedAt: new Date() };
  const [mapping] = await db().insert(schema.researchMappings).values(values).onConflictDoUpdate({ target: [schema.researchMappings.evidenceId, schema.researchMappings.siteSlug], set: values }).returning();
  return NextResponse.json({ mapping }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = ReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Approval permission required." }, { status: 403 });
    return NextResponse.json({ mapping: { id: parsed.data.id, status: parsed.data.action === "approve" ? "approved" : "rejected", synthetic: true } });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Research mapping requires DATABASE_URL." }, { status: 503 });
  const [current] = await db().select({ mapping: schema.researchMappings, evidence: schema.researchEvidence }).from(schema.researchMappings)
    .innerJoin(schema.researchEvidence, eq(schema.researchEvidence.id, schema.researchMappings.evidenceId))
    .where(eq(schema.researchMappings.id, parsed.data.id)).limit(1);
  if (!current) return NextResponse.json({ error: "Mapped opportunity not found." }, { status: 404 });
  if (!await canAccessSite(request, current.mapping.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "manage_content", current.mapping.siteSlug)) return NextResponse.json({ error: "Approval permission required for this website." }, { status: 403 });
  const approved = parsed.data.action === "approve";
  const actor = request.headers.get("x-orwell-user-email");
  const now = new Date();
  const mapping = await db().transaction(async (tx) => {
    if (approved) await tx.insert(schema.workflowItems).values({
      domainSlug: current.mapping.siteSlug,
      recommendationKey: `research:${current.mapping.id}`,
      decision: "approved",
      title: current.mapping.title,
      module: "Research",
      effort: "M",
      priorityScore: current.mapping.priorityScore,
      status: "approved",
      sourceUrl: `/domain-research?evidence=${current.evidence.id}&mapping=${current.mapping.id}`,
      sourceEvidence: { evidenceId: current.evidence.id, mappingId: current.mapping.id, kind: current.evidence.kind, sourceValue: current.evidence.sourceValue, capturedAt: current.evidence.capturedAt },
      createdBy: actor,
      updatedAt: now,
    }).onConflictDoUpdate({ target: [schema.workflowItems.domainSlug, schema.workflowItems.recommendationKey], set: { decision: "approved", status: "approved", title: current.mapping.title, priorityScore: current.mapping.priorityScore, sourceUrl: `/domain-research?evidence=${current.evidence.id}&mapping=${current.mapping.id}`, updatedAt: now } });
    const [updated] = await tx.update(schema.researchMappings).set({ status: approved ? "approved" : "rejected", reviewedBy: actor, reviewedAt: now, updatedAt: now }).where(and(eq(schema.researchMappings.id, current.mapping.id), eq(schema.researchMappings.status, "mapped"))).returning();
    if (!updated) throw new Error("This mapped opportunity has already been reviewed.");
    await tx.insert(schema.accessAuditEvents).values({ siteSlug: current.mapping.siteSlug, actorEmail: actor, actorRole: request.headers.get("x-orwell-user-role"), action: approved ? "research_mapping.approved" : "research_mapping.rejected", area: "research", summary: `${approved ? "Approved" : "Rejected"} mapped research: ${current.mapping.title}`, metadata: { evidenceId: current.evidence.id, mappingId: current.mapping.id } });
    return updated;
  });
  return NextResponse.json({ mapping });
}
