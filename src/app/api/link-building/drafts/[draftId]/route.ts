import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { approveOutreachDraft, sendApprovedOutreach } from "@/platform/link-outreach";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), recipientEmail: z.string().email().nullable(), subject: z.string().min(2).max(300), body: z.string().min(10).max(10_000) }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("send") }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid draft action." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Outreach permission required." }, { status: 403 });
    const now = new Date().toISOString();
    const status = parsed.data.action === "approve" ? "approved" : parsed.data.action === "send" ? "sent" : "draft";
    return NextResponse.json({
      synthetic: true,
      draft: {
        id: draftId,
        status,
        approvedBy: status === "draft" ? null : request.headers.get("x-orwell-user-email"),
        approvedAt: status === "draft" ? null : now,
        sentAt: status === "sent" ? now : null,
      },
      delivery: parsed.data.action === "send" ? "suppressed_in_qa" : undefined,
    });
  }
  if (!z.string().uuid().safeParse(draftId).success) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "Link workflow requires DATABASE_URL." }, { status: 503 });
  const [existing] = await db().select({ siteSlug: schema.outreachDrafts.siteSlug }).from(schema.outreachDrafts).where(eq(schema.outreachDrafts.id, draftId)).limit(1);
  if (!existing || !await canAccessSite(request, existing.siteSlug)) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (!await hasPermission(request, "manage_content", existing.siteSlug)) return NextResponse.json({ error: "Outreach permission required for this website." }, { status: 403 });
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
