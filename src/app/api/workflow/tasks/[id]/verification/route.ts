import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";
import { captureBaseline, recordCheckpoint, recordShipment, type VerificationState } from "@/platform/workflow-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().uuid() });
const MetricSchema = z.object({ key: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120), value: z.number(), unit: z.string().trim().min(1).max(40), source: z.string().trim().min(1).max(120) });
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capture_baseline") }),
  z.object({ action: z.literal("record_shipment"), note: z.string().trim().max(1000).nullable().optional(), url: z.string().trim().max(1000).nullable().optional() }),
  z.object({ action: z.literal("record_checkpoint"), day: z.union([z.literal(7), z.literal(14), z.literal(28)]), metrics: z.array(MetricSchema).max(30), note: z.string().trim().max(1000).nullable().optional(), outcome: z.enum(["awaiting_data", "won", "lost", "inconclusive"]).optional() }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [parsedParams, parsed] = await Promise.all([ParamsSchema.safeParseAsync(await params), ActionSchema.safeParseAsync(await request.json().catch(() => null))]);
  if (!parsedParams.success || !parsed.success) return NextResponse.json({ error: "Complete the verification update." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Workflow permission required." }, { status: 403 });
    const seed = captureBaseline({ kind: "gsc_page", clicks: 120, impressions: 4100, position: 8.2 }, new Date("2026-08-20T00:00:00Z"));
    const verification = parsed.data.action === "capture_baseline" ? seed : parsed.data.action === "record_shipment" ? recordShipment(seed, parsed.data) : recordCheckpoint(recordShipment(seed, {}), parsed.data);
    return NextResponse.json({ item: { id: parsedParams.data.id, verification, status: parsed.data.action === "record_shipment" ? "shipped" : parsed.data.action === "record_checkpoint" ? "verifying" : "in_progress", updatedAt: new Date().toISOString() }, synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Workflow verification requires DATABASE_URL." }, { status: 503 });
  const [item] = await db().select().from(schema.workflowItems).where(eq(schema.workflowItems.id, parsedParams.data.id)).limit(1);
  if (!item || !await canAccessSite(request, item.domainSlug)) return NextResponse.json({ error: "Execution item access required." }, { status: 403 });
  if (!await hasPermission(request, "manage_content", item.domainSlug)) return NextResponse.json({ error: "Workflow permission required for this website." }, { status: 403 });
  const current = item.verification as VerificationState;
  const now = new Date();
  let verification: VerificationState;
  let status = item.status;
  if (parsed.data.action === "capture_baseline") { verification = captureBaseline(item.sourceEvidence, now); status = item.status === "approved" ? "in_progress" : item.status; }
  else if (parsed.data.action === "record_shipment") { verification = recordShipment(current, parsed.data, now); status = "shipped"; }
  else { verification = recordCheckpoint(current, parsed.data, now); status = "verifying"; }
  const [updated] = await db().update(schema.workflowItems).set({ verification, status, shippedAt: parsed.data.action === "record_shipment" ? now : undefined, updatedAt: now }).where(eq(schema.workflowItems.id, item.id)).returning();
  return NextResponse.json({ item: updated });
}
