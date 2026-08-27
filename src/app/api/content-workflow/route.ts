import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_STAGES = ["brief", "draft", "review", "published"] as const;
const BriefSchema = z.object({
  primaryKeyword: z.string().trim().max(160).default(""),
  secondaryKeywords: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  searchIntent: z.enum(["informational", "commercial", "transactional", "navigational", "mixed"]).default("mixed"),
  titleRecommendation: z.string().trim().max(300).default(""),
  metaRecommendation: z.string().trim().max(500).default(""),
  headingPlan: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  coverageNotes: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  internalLinks: z.array(z.string().trim().min(1).max(1000)).max(50).default([]),
  schemaRecommendations: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
});
const UpdateSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().uuid(), action: z.literal("update_brief"), brief: BriefSchema }),
  z.object({ id: z.string().uuid(), action: z.literal("advance"), stage: z.enum(CONTENT_STAGES), draftUrl: z.string().trim().max(1000).nullable().optional(), publishedUrl: z.string().trim().max(1000).nullable().optional() }),
]);

function contentData(item: typeof schema.workflowItems.$inferSelect) {
  const data = item.executionData ?? {};
  return { ...item, contentStage: CONTENT_STAGES.includes(data.contentStage as typeof CONTENT_STAGES[number]) ? data.contentStage : "brief", brief: data.brief ?? {}, draftUrl: data.draftUrl ?? null, publishedUrl: data.publishedUrl ?? null };
}

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim() ?? "";
  if (!siteSlug || !await getManagedSite(siteSlug)) return NextResponse.json({ error: "Choose a website first." }, { status: 400 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ items: [{ id: "74000000-0000-4000-8000-000000000001", domainSlug: siteSlug, title: "Refresh the UAE mortgage comparison guide", executionType: "refresh_brief", priorityScore: 84, targetUrl: `https://${siteSlug}.example/mortgage-guide`, plannedUrl: null, ownerEmail: "qa@orwell.local", dueDate: "2026-09-10", sourceUrl: `/content?site=${siteSlug}`, sourceEvidence: { kind: "gsc_page", clicks: 420, impressions: 12400 }, executionData: { targetKeywords: ["uae mortgage comparison"] }, contentStage: "brief", brief: { primaryKeyword: "uae mortgage comparison", searchIntent: "commercial" }, draftUrl: null, publishedUrl: null }, { id: "74000000-0000-4000-8000-000000000002", domainSlug: siteSlug, title: "Review the first-time buyer draft", executionType: "content_brief", priorityScore: 72, targetUrl: null, plannedUrl: "/guides/first-time-buyer", ownerEmail: "qa@orwell.local", dueDate: "2026-09-14", sourceUrl: `/keyword-strategy?site=${siteSlug}`, sourceEvidence: { kind: "keyword_cluster" }, executionData: { targetKeywords: ["first time buyer mortgage uae"] }, contentStage: "review", brief: { primaryKeyword: "first time buyer mortgage uae", searchIntent: "informational" }, draftUrl: "https://docs.example/draft", publishedUrl: null }], synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Content workflow requires DATABASE_URL." }, { status: 503 });
  const rows = await db().select().from(schema.workflowItems).where(and(eq(schema.workflowItems.domainSlug, siteSlug), eq(schema.workflowItems.decision, "approved"), inArray(schema.workflowItems.executionType, ["content_brief", "refresh_brief"]))).orderBy(desc(schema.workflowItems.priorityScore), desc(schema.workflowItems.updatedAt));
  return NextResponse.json({ items: rows.map(contentData) });
}

export async function PATCH(request: Request) {
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the content workflow update." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Content workflow permission required." }, { status: 403 });
    return NextResponse.json({ item: { id: parsed.data.id, ...(parsed.data.action === "advance" ? { contentStage: parsed.data.stage, draftUrl: parsed.data.draftUrl ?? null, publishedUrl: parsed.data.publishedUrl ?? null } : { brief: parsed.data.brief }), updatedAt: new Date().toISOString() }, synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Content workflow requires DATABASE_URL." }, { status: 503 });
  const [current] = await db().select().from(schema.workflowItems).where(eq(schema.workflowItems.id, parsed.data.id)).limit(1);
  if (!current || !await canAccessSite(request, current.domainSlug)) return NextResponse.json({ error: "Content work not found." }, { status: 404 });
  if (!await hasPermission(request, "manage_content", current.domainSlug)) return NextResponse.json({ error: "Content workflow permission required for this website." }, { status: 403 });
  if (!current.executionType || !["content_brief", "refresh_brief"].includes(current.executionType)) return NextResponse.json({ error: "This is not content work." }, { status: 400 });
  const data = current.executionData ?? {};
  if (parsed.data.action === "advance") {
    const currentStage = CONTENT_STAGES.includes(data.contentStage as typeof CONTENT_STAGES[number]) ? data.contentStage as typeof CONTENT_STAGES[number] : "brief";
    if (CONTENT_STAGES.indexOf(parsed.data.stage) !== CONTENT_STAGES.indexOf(currentStage) + 1) return NextResponse.json({ error: "Move content through each editorial stage in order." }, { status: 409 });
    if (parsed.data.stage === "review" && !parsed.data.draftUrl?.trim()) return NextResponse.json({ error: "Add the draft URL before review." }, { status: 400 });
    if (parsed.data.stage === "published" && !parsed.data.publishedUrl?.trim()) return NextResponse.json({ error: "Add the live published URL." }, { status: 400 });
    const nextData = { ...data, contentStage: parsed.data.stage, draftUrl: parsed.data.draftUrl ?? data.draftUrl ?? null, publishedUrl: parsed.data.publishedUrl ?? data.publishedUrl ?? null };
    const [updated] = await db().update(schema.workflowItems).set({ executionData: nextData, targetUrl: parsed.data.stage === "published" && parsed.data.publishedUrl ? parsed.data.publishedUrl : current.targetUrl, updatedAt: new Date() }).where(eq(schema.workflowItems.id, current.id)).returning();
    return NextResponse.json({ item: contentData(updated!) });
  }
  const [updated] = await db().update(schema.workflowItems).set({ executionData: { ...data, brief: parsed.data.brief }, updatedAt: new Date() }).where(eq(schema.workflowItems.id, current.id)).returning();
  return NextResponse.json({ item: contentData(updated!) });
}
