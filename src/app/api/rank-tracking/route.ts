import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddSchema = z.object({
  siteSlug: z.string().min(1).max(120),
  campaignId: z.string().uuid().nullable().optional(),
  campaignName: z.string().min(2).max(120).optional(),
  cadence: z.enum(["daily", "weekly"]).default("weekly"),
  searchEngine: z.string().max(40).default("google"),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(10).default("en"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  keywords: z.array(z.object({ keyword: z.string().min(1).max(400), targetUrl: z.string().max(2000).nullable().optional(), tags: z.array(z.string()).optional() })).min(1).max(500),
});

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim();
  if (!siteSlug) return NextResponse.json({ error: "Choose a website first." }, { status: 400 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, campaigns: [], keywords: [], synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Rank tracking requires DATABASE_URL." }, { status: 503 });
  const [campaigns, keywords] = await Promise.all([
    db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.siteSlug, siteSlug)).orderBy(desc(schema.rankTrackingCampaigns.updatedAt)).limit(100),
    db().select().from(schema.rankTrackingKeywords).where(eq(schema.rankTrackingKeywords.siteSlug, siteSlug)).orderBy(desc(schema.rankTrackingKeywords.createdAt)).limit(5_000),
  ]);
  return NextResponse.json({ ok: true, campaigns, keywords });
}

export async function POST(request: Request) {
  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid tracking request." }, { status: 400 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "research", parsed.data.siteSlug)) return NextResponse.json({ error: "Research permission required for this website." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, synthetic: true, campaign: { id: parsed.data.campaignId ?? crypto.randomUUID(), name: parsed.data.campaignName ?? "Research tracking" }, added: parsed.data.keywords.length }, { status: 201 });
  if (!hasDatabase()) return NextResponse.json({ error: "Rank tracking requires DATABASE_URL." }, { status: 503 });
  let campaignId = parsed.data.campaignId ?? null;
  if (!campaignId) {
    const [campaign] = await db().insert(schema.rankTrackingCampaigns).values({ siteSlug: parsed.data.siteSlug, name: parsed.data.campaignName ?? `Research · ${new Date().toLocaleDateString("en-GB")}`, defaultCadence: parsed.data.cadence, searchEngine: parsed.data.searchEngine, createdBy: request.headers.get("x-orwell-user-email") }).returning();
    campaignId = campaign!.id;
  } else {
    const [campaign] = await db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.id, campaignId)).limit(1);
    if (!campaign || campaign.siteSlug !== parsed.data.siteSlug) return NextResponse.json({ error: "Tracking campaign not found." }, { status: 404 });
  }
  const inserted = await db().insert(schema.rankTrackingKeywords).values(parsed.data.keywords.map((item) => ({ siteSlug: parsed.data.siteSlug, campaignId, keyword: item.keyword, locationCode: parsed.data.locationCode, languageCode: parsed.data.languageCode, device: parsed.data.device, targetUrl: item.targetUrl ?? null, tags: item.tags ?? [], cadence: parsed.data.cadence, searchEngine: parsed.data.searchEngine }))).onConflictDoNothing().returning({ id: schema.rankTrackingKeywords.id });
  return NextResponse.json({ ok: true, campaignId, added: inserted.length, skipped: parsed.data.keywords.length - inserted.length }, { status: 201 });
}
