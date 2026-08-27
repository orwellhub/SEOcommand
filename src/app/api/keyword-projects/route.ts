import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({ siteSlug: z.string().max(120).nullable().optional(), name: z.string().min(2).max(120), description: z.string().max(500).optional(), tags: z.array(z.string().max(40)).max(20).optional() });
const UpdateSchema = z.object({ id: z.string().uuid(), name: z.string().min(2).max(120).optional(), description: z.string().max(500).nullable().optional(), status: z.enum(["active", "archived"]).optional() });
type QaProject = { id: string; siteSlug: string | null; name: string; description: string | null; status: string; tags: string[]; createdBy: string | null; createdAt: string; updatedAt: string };
const qaProjects: QaProject[] = [];

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim() || null;
  if (siteSlug && !await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, projects: qaProjects.filter((item) => !siteSlug || item.siteSlug === siteSlug), synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Research projects require DATABASE_URL." }, { status: 503 });
  const query = db().select().from(schema.keywordProjects).$dynamic();
  const projects = await (siteSlug ? query.where(eq(schema.keywordProjects.siteSlug, siteSlug)) : query).orderBy(desc(schema.keywordProjects.updatedAt)).limit(200);
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project." }, { status: 400 });
  if (parsed.data.siteSlug && !await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "research", parsed.data.siteSlug)) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    const now = new Date().toISOString();
    const project: QaProject = { id: crypto.randomUUID(), siteSlug: parsed.data.siteSlug ?? null, name: parsed.data.name, description: parsed.data.description ?? null, status: "active", tags: parsed.data.tags ?? [], createdBy: request.headers.get("x-orwell-user-email"), createdAt: now, updatedAt: now };
    qaProjects.unshift(project); return NextResponse.json({ ok: true, project, synthetic: true }, { status: 201 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Research projects require DATABASE_URL." }, { status: 503 });
  const [project] = await db().insert(schema.keywordProjects).values({ siteSlug: parsed.data.siteSlug ?? null, name: parsed.data.name, description: parsed.data.description, tags: parsed.data.tags ?? [], createdBy: request.headers.get("x-orwell-user-email") }).returning();
  return NextResponse.json({ ok: true, project }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid project update." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    const project = qaProjects.find((item) => item.id === parsed.data.id);
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (!await hasPermission(request, "research", project.siteSlug)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    Object.assign(project, parsed.data, { updatedAt: new Date().toISOString() }); return NextResponse.json({ ok: true, project, synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Research projects require DATABASE_URL." }, { status: 503 });
  const [current] = await db().select().from(schema.keywordProjects).where(eq(schema.keywordProjects.id, parsed.data.id)).limit(1);
  if (!current || (current.siteSlug && !await canAccessSite(request, current.siteSlug))) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!await hasPermission(request, "research", current.siteSlug)) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
  const [project] = await db().update(schema.keywordProjects).set({ name: parsed.data.name ?? current.name, description: parsed.data.description === undefined ? current.description : parsed.data.description, status: parsed.data.status ?? current.status, updatedAt: new Date() }).where(eq(schema.keywordProjects.id, current.id)).returning();
  return NextResponse.json({ ok: true, project });
}
