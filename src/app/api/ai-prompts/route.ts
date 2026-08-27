import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { getManagedSite, listManagedSites, resolveGroupSiteSlugs } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";
import { canAccessSite, filterAccessibleSiteSlugs } from "@/platform/access";

const Platform = z.enum(["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"]);
const CreateSchema = z.object({
  siteSlug: z.string().min(1).max(100),
  prompt: z.string().trim().min(8).max(1000),
  topic: z.string().trim().min(2).max(100),
  platforms: z.array(Platform).min(1),
  cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  priority: z.number().int().min(0).max(100).default(50),
  sampleCount: z.number().int().min(1).max(5).default(1),
  source: z.string().max(40).default("manual"),
});

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "portfolio";
  let siteSlugs: string[];
  if (scope === "portfolio") siteSlugs = (await listManagedSites()).map((site) => site.id);
  else if (scope.startsWith("group:")) siteSlugs = await resolveGroupSiteSlugs(scope.slice(6));
  else siteSlugs = [scope];
  siteSlugs = await filterAccessibleSiteSlugs(request, siteSlugs);
  if (!scope.startsWith("group:") && scope !== "portfolio" && siteSlugs.length === 0) {
    return NextResponse.json({ error: "Website access required." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ prompts: [] });
  const prompts = siteSlugs.length ? await db().select().from(schema.aiTrackingPrompts)
    .where(inArray(schema.aiTrackingPrompts.siteSlug, siteSlugs))
    .orderBy(asc(schema.aiTrackingPrompts.nextRunAt)) : [];
  return NextResponse.json({ prompts });
}

export async function POST(request: Request) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the prompt fields.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const site = await getManagedSite(parsed.data.siteSlug);
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ prompt: { id: "51000000-0000-4000-8000-000000000099", ...parsed.data, active: true, synthetic: true } }, { status: 201 });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const [prompt] = await db().insert(schema.aiTrackingPrompts).values({
    ...parsed.data,
    locationCode: site.dataForSeoLocationCode,
    languageCode: site.dataForSeoLanguageCode,
  }).returning();
  return NextResponse.json({ prompt }, { status: 201 });
}
