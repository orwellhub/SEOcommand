import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase, readLatestSnapshots } from "@/sync/store";
import { baselineFromSnapshots, measurementFromSnapshots, measurementIsFreshFor } from "@/platform/outcome-evidence";
import { captureBaseline, recordCheckpoint, recordShipment, type VerificationState } from "@/platform/workflow-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().uuid() });
const MetricSchema = z.object({ key: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120), value: z.number(), unit: z.string().trim().min(1).max(40), source: z.string().trim().min(1).max(120) });
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture_baseline") }),
  z.object({ action: z.literal("record_shipment"), note: z.string().trim().max(1000).nullable().optional(), url: z.string().trim().max(1000).nullable().optional() }),
  z.object({ action: z.literal("collect_evidence"), day: z.union([z.literal(7), z.literal(14), z.literal(28)]) }),
  z.object({ action: z.literal("record_checkpoint"), day: z.union([z.literal(7), z.literal(14), z.literal(28)]), metrics: z.array(MetricSchema).max(30), note: z.string().trim().max(1000).nullable().optional(), outcome: z.enum(["awaiting_data", "won", "lost", "inconclusive"]).optional(), confidence: z.enum(["low", "medium", "high"]).optional(), alternativeExplanations: z.array(z.string().trim().min(1).max(500)).max(10).optional(), valueCreated: z.object({ amount: z.number().nonnegative(), currency: z.string().trim().min(3).max(3).transform((value) => value.toUpperCase()), method: z.enum(["recorded", "estimated"]), assumption: z.string().trim().max(500).nullable().optional() }).nullable().optional() }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [parsedParams, parsed] = await Promise.all([ParamsSchema.safeParseAsync(await params), ActionSchema.safeParseAsync(await request.json().catch(() => null))]);
  if (!parsedParams.success || !parsed.success) return NextResponse.json({ error: "Complete the verification update." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Workflow permission required." }, { status: 403 });
    const seed = captureBaseline({ kind: "gsc_page", clicks: 120, impressions: 4100, position: 8.2 }, new Date("2026-08-20T00:00:00Z"));
    const shipped = recordShipment(seed, {}, new Date("2026-08-21T00:00:00Z"));
    let verification: VerificationState;
    if (parsed.data.action === "capture_baseline") verification = seed;
    else if (parsed.data.action === "record_shipment") verification = recordShipment(seed, parsed.data);
    else if (parsed.data.action === "collect_evidence") verification = recordCheckpoint(shipped, { day: parsed.data.day, metrics: seed.baseline?.metrics ?? [], outcome: "awaiting_data", note: "Collected automatically from stored first-party data." });
    else verification = recordCheckpoint(shipped, parsed.data);
    const verified = parsed.data.action === "record_checkpoint" && parsed.data.outcome !== undefined && parsed.data.outcome !== "awaiting_data";
    return NextResponse.json({ item: { id: parsedParams.data.id, verification, status: verified ? "done" : parsed.data.action === "record_shipment" ? "shipped" : parsed.data.action === "record_checkpoint" || parsed.data.action === "collect_evidence" ? "verifying" : "in_progress", verifiedAt: verified ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }, synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Workflow verification requires DATABASE_URL." }, { status: 503 });
  const [item] = await db().select().from(schema.workflowItems).where(eq(schema.workflowItems.id, parsedParams.data.id)).limit(1);
  if (!item || !await canAccessSite(request, item.domainSlug)) return NextResponse.json({ error: "Execution item access required." }, { status: 403 });
  if (!await hasPermission(request, "manage_content", item.domainSlug)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });
  const current = item.verification as VerificationState;
  const now = new Date();
  let verification: VerificationState;
  let status = item.status;
  if (parsed.data.action === "capture_baseline") {
    if (current.baseline || current.shipment) return NextResponse.json({ error: "The pre-action baseline is already fixed for this execution item." }, { status: 409 });
    verification = baselineFromSnapshots(item, await readLatestSnapshots(item.domainSlug), now); status = item.status === "approved" ? "in_progress" : item.status;
  }
  else if (parsed.data.action === "record_shipment") { verification = recordShipment(current, parsed.data, now); status = "shipped"; }
  else if (parsed.data.action === "collect_evidence") {
    const checkpointDay = parsed.data.day;
    const checkpoint = current.checkpoints?.find((entry) => entry.day === checkpointDay);
    if (!checkpoint || checkpoint.status === "recorded") return NextResponse.json({ error: "This checkpoint is not awaiting evidence." }, { status: 409 });
    if (new Date(checkpoint.dueAt) > now) return NextResponse.json({ error: `Day ${checkpoint.day} evidence is scheduled for ${checkpoint.dueAt.slice(0, 10)}.` }, { status: 409 });
    const measurement = measurementFromSnapshots(item, await readLatestSnapshots(item.domainSlug));
    if (!measurement || !measurementIsFreshFor(measurement, checkpoint.dueAt)) return NextResponse.json({ error: "Fresh stored GSC/GA4 evidence is not available for this target yet. Check the Google connection, target URL and target keywords." }, { status: 409 });
    verification = recordCheckpoint(current, { day: checkpoint.day, metrics: measurement.metrics, provenance: measurement.provenance, note: "Collected from stored first-party data. Awaiting human outcome review." }, now);
    status = verification.outcome && verification.outcome !== "awaiting_data" ? "done" : "verifying";
  }
  else {
    const review = parsed.data;
    const checkpoint = current.checkpoints?.find((entry) => entry.day === review.day);
    if (!checkpoint) return NextResponse.json({ error: "Record shipment before adding outcome evidence." }, { status: 409 });
    if (new Date(checkpoint.dueAt) > now) return NextResponse.json({ error: `Day ${checkpoint.day} evidence is scheduled for ${checkpoint.dueAt.slice(0, 10)}.` }, { status: 409 });
    const metrics = checkpoint.provenance?.mode === "stored_first_party" ? checkpoint.metrics ?? [] : review.metrics;
    const provenance = checkpoint.provenance ?? { mode: "manual" as const, datasets: [], capturedOn: now.toISOString().slice(0, 10), scope: item.targetUrl || item.plannedUrl ? "page" as const : "site" as const, target: current.shipment?.url ?? item.targetUrl ?? item.plannedUrl };
    verification = recordCheckpoint(current, { ...review, metrics, provenance }, now);
    status = review.outcome && review.outcome !== "awaiting_data" ? "done" : "verifying";
  }
  const verified = verification.outcome !== undefined && verification.outcome !== "awaiting_data";
  const updated = await db().transaction(async (tx) => {
    const [next] = await tx.update(schema.workflowItems).set({ verification, status, shippedAt: parsed.data.action === "record_shipment" ? now : undefined, verifiedAt: verified ? now : null, updatedAt: now }).where(eq(schema.workflowItems.id, item.id)).returning();
    await tx.insert(schema.accessAuditEvents).values({ siteSlug: item.domainSlug, actorEmail: request.headers.get("x-orwell-user-email"), actorRole: request.headers.get("x-orwell-user-role"), action: `workflow.verification_${parsed.data.action}`, area: "workflow", summary: `${parsed.data.action.replace(/_/g, " ")}: ${item.title}`, metadata: { workflowItemId: item.id, outcome: verification.outcome ?? "awaiting_data" } });
    return next;
  });
  return NextResponse.json({ item: updated });
}
