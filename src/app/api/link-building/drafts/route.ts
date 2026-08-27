import { NextResponse } from "next/server";
import { z } from "zod";
import { createOutreachDraft } from "@/platform/link-outreach";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";

const DraftSchema = z.object({ prospectId: z.string().uuid(), recipientEmail: z.string().email().optional().nullable(), angle: z.string().max(500).optional().nullable() });

export async function POST(request: Request) {
  const parsed = DraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a prospect and enter a valid email." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Outreach permission required." }, { status: 403 });
    return NextResponse.json({
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
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Link workflow requires DATABASE_URL." }, { status: 503 });
  const [prospect] = await db().select({ siteSlug: schema.linkProspects.siteSlug }).from(schema.linkProspects).where(eq(schema.linkProspects.id, parsed.data.prospectId)).limit(1);
  if (!prospect || !await canAccessSite(request, prospect.siteSlug)) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  if (!await hasPermission(request, "manage_content", prospect.siteSlug)) return NextResponse.json({ error: "Outreach permission required for this website." }, { status: 403 });
  try {
    return NextResponse.json({ draft: await createOutreachDraft(parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft could not be created." }, { status: 400 });
  }
}
