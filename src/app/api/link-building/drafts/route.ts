import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { createOutreachDraft } from "@/platform/link-outreach";

export const runtime = "nodejs";

const DraftSchema = z.object({ prospectId: z.string().uuid(), recipientEmail: z.string().email().optional().nullable(), angle: z.string().max(500).optional().nullable() });

export async function POST(request: Request) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = DraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a prospect and enter a valid email." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({
    synthetic: true,
    draft: {
      id: "31000000-0000-4000-8000-000000000099",
      prospectId: parsed.data.prospectId,
      recipientEmail: parsed.data.recipientEmail ?? null,
      subject: "Reviewable link opportunity",
      body: parsed.data.angle || "Synthetic QA outreach draft. Nothing is delivered from staging.",
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      sentAt: null,
    },
  }, { status: 201 });
  try {
    return NextResponse.json({ draft: await createOutreachDraft(parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft could not be created." }, { status: 400 });
  }
}
