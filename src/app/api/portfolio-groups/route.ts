import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { listPortfolioGroups } from "@/platform/site-store";
import { accessibleSiteSlugs, grantedGroupIds, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#7137F5"),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).optional().default(0),
});

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "group";
}

export async function GET(request: Request) {
  const groups = await listPortfolioGroups();
  const accessible = await accessibleSiteSlugs(request);
  if (accessible === null) return NextResponse.json({ groups });
  const allowed = new Set(accessible);
  const directlyGranted = new Set(await grantedGroupIds(request));
  return NextResponse.json({
    groups: groups.filter((group) => directlyGranted.has(group.id) || group.siteSlugs.some((siteSlug) => allowed.has(siteSlug))),
  });
}

export async function POST(request: Request) {
  if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Portfolio-structure permission required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Review the group details." }, { status: 400 });
    return NextResponse.json({ group: { id: crypto.randomUUID(), slug: slugify(parsed.data.name), ...parsed.data, synthetic: true } }, { status: 201 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the group details." }, { status: 400 });
  const input = parsed.data;
  if (input.parentId) {
    const [parent] = await db().select({ id: schema.portfolioGroups.id }).from(schema.portfolioGroups).where(eq(schema.portfolioGroups.id, input.parentId)).limit(1);
    if (!parent) return NextResponse.json({ error: "Parent group not found." }, { status: 404 });
  }
  const base = slugify(input.name);
  const slug = `${base}-${createHash("sha1").update(`${input.name}:${Date.now()}`).digest("hex").slice(0, 6)}`;
  const [group] = await db().insert(schema.portfolioGroups).values({
    name: input.name,
    slug,
    description: input.description || null,
    color: input.color,
    parentId: input.parentId || null,
    sortOrder: input.sortOrder,
    createdBy: request.headers.get("x-orwell-user-email"),
  }).returning();
  return NextResponse.json({ group }, { status: 201 });
}
