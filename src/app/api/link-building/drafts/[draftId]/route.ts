import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { approveOutreachDraft, sendApprovedOutreach } from "@/platform/link-outreach";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), recipientEmail: z.string().email().nullable(), subject: z.string().min(2).max(300), body: z.string().min(10).max(10_000) }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("send") }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  if (process.env.QA_SYNTHETIC === "true") {
    const body = await request.json().catch(() => ({})) as { action?: string };
    return NextResponse.json({ draft: { id: draftId, status: body.action === "approve" ? "approved" : body.action === "send" ? "sent" : "draft", synthetic: true }, delivery: body.action === "send" ? "suppressed_in_qa" : undefined });
  }
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!z.string().uuid().safeParse(draftId).success) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid draft action." }, { status: 400 });
  try {
    if (parsed.data.action === "approve") return NextResponse.json({ draft: await approveOutreachDraft(draftId, request.headers.get("x-orwell-user-email")) });
    if (parsed.data.action === "send") return NextResponse.json(await sendApprovedOutreach(draftId));
    const [draft] = await db().update(schema.outreachDrafts).set({
      recipientEmail: parsed.data.recipientEmail,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: "draft",
      approvedAt: null,
      approvedBy: null,
      updatedAt: new Date(),
    }).where(and(eq(schema.outreachDrafts.id, draftId), inArray(schema.outreachDrafts.status, ["draft", "approved"]))).returning();
    if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft action failed." }, { status: 400 });
  }
}
