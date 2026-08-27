import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { getManagedSite } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";
import { canAccessSite } from "@/platform/access";

const Schema = z.object({
  platforms: z.array(z.enum(["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"])).min(1),
  cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
});

export async function POST(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose platforms and cadence." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ prompt: { id: "51000000-0000-4000-8000-000000000098", ...parsed.data, active: true, synthetic: true }, accepted: true, opportunityId });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const [opportunity] = await db().select().from(schema.aiPromptOpportunities)
    .where(eq(schema.aiPromptOpportunities.id, opportunityId)).limit(1);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  const site = await getManagedSite(opportunity.siteSlug);
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, site.id)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  const [prompt] = await db().transaction(async (tx) => {
    const rows = await tx.insert(schema.aiTrackingPrompts).values({
      siteSlug: opportunity.siteSlug,
      prompt: opportunity.prompt,
      topic: opportunity.topic,
      platforms: parsed.data.platforms,
      cadence: parsed.data.cadence,
      priority: opportunity.priorityScore,
      source: opportunity.source,
      locationCode: site.dataForSeoLocationCode,
      languageCode: site.dataForSeoLanguageCode,
    }).onConflictDoNothing().returning();
    await tx.update(schema.aiPromptOpportunities).set({ status: "accepted", updatedAt: new Date() })
      .where(eq(schema.aiPromptOpportunities.id, opportunity.id));
    return rows;
  });
  return NextResponse.json({ prompt, accepted: true });
}
