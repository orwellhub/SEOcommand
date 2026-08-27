import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { getManagedSite, listManagedSites, resolveGroupSiteSlugs } from "@/platform/site-store";
import { localSeoDashboard } from "@/platform/local-seo";
import { qaLocalSeo } from "@/data/qa-fixtures";
import { canAccessSite, filterAccessibleSiteSlugs } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function scopeSites(scope: string) {
  if (scope === "portfolio") return (await listManagedSites()).map((site) => site.id);
  if (scope.startsWith("group:")) return resolveGroupSiteSlugs(scope.slice(6));
  return (await getManagedSite(scope)) ? [scope] : null;
}

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "portfolio";
  const requested = await scopeSites(scope);
  if (!requested) return NextResponse.json({ error: "Scope not found." }, { status: 404 });
  const sites = await filterAccessibleSiteSlugs(request, requested);
  if (!scope.startsWith("group:") && scope !== "portfolio" && sites.length === 0) {
    return NextResponse.json({ error: "Website access required." }, { status: 403 });
  }
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json(qaLocalSeo(scope, sites));
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Local SEO requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json(await localSeoDashboard(sites));
}

const LocationSchema = z.object({
  siteSlug: z.string().min(1),
  name: z.string().min(2).max(160),
  businessKeyword: z.string().min(2).max(300),
  address: z.string().max(500).optional().nullable(),
  placeId: z.string().max(200).optional().nullable(),
  cid: z.string().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  gridRadiusKm: z.number().min(0.2).max(50).default(5),
  gridSize: z.union([z.literal(3), z.literal(5)]).default(3),
  keywords: z.array(z.string().min(2).max(200)).min(1).max(5),
});

export async function POST(request: Request) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = LocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the location and grid settings.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  const checksPerRun = parsed.data.gridSize ** 2 * parsed.data.keywords.length;
  const estimatedMonthlyUsd = Math.round((4.33 * (0.02 + checksPerRun * 0.003) * 1.25) * 100) / 100;
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ location: { id: "40000000-0000-4000-8000-000000000099", approval: "pending", synthetic: true }, forecast: { checksPerRun, cadence: "weekly", estimatedMonthlyUsd } }, { status: 201 });
  if (!hasDatabase()) return NextResponse.json({ error: "Local SEO requires DATABASE_URL." }, { status: 503 });
  if (!(await getManagedSite(parsed.data.siteSlug))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const [location] = await db().insert(schema.localSeoLocations).values({ ...parsed.data, estimatedMonthlyUsd, active: false, approval: "pending" }).returning();
  return NextResponse.json({ location, forecast: { checksPerRun, cadence: "weekly", estimatedMonthlyUsd } }, { status: 201 });
}
