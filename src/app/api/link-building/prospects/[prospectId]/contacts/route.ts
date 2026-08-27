import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { enrichProspectContacts } from "@/platform/link-outreach";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await params;
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "research")) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
    return NextResponse.json({ contacts: [{ type: "email", value: "editor@publisher.example", source: "synthetic_qa" }], prospectId, synthetic: true });
  }
  if (!z.string().uuid().safeParse(prospectId).success) return NextResponse.json({ error: "Invalid prospect." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "Link workflow requires DATABASE_URL." }, { status: 503 });
  const [prospect] = await db().select({ siteSlug: schema.linkProspects.siteSlug }).from(schema.linkProspects).where(eq(schema.linkProspects.id, prospectId)).limit(1);
  if (!prospect || !await canAccessSite(request, prospect.siteSlug)) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });
  if (!await hasPermission(request, "research", prospect.siteSlug)) return NextResponse.json({ error: "Research permission required for this website." }, { status: 403 });
  try {
    return NextResponse.json({ contacts: await enrichProspectContacts(prospectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contact research failed." }, { status: 502 });
  }
}
