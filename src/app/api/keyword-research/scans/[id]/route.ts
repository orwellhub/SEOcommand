import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { KeywordResearchResult, KeywordResearchRow } from "@/lib/types";
import {commandRecords,saveCommandRecord} from "@/platform/command-store";
import { listManagedSites } from "@/platform/site-store";
import { canAccessSite, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One saved keyword scan.
 *
 * GET    → the full stored result, replayed from Postgres. This is the reason
 *          scans are persisted with their rows: reopening a past search never
 *          re-queries DataForSEO and therefore never spends budget.
 * DELETE → remove a saved search.
 */

async function previewScans() {
  return (await Promise.all(["__qa_research__", ...(await listManagedSites()).map(s => s.id)].map(commandRecords))).flat();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "Saved searches require DATABASE_URL." },
    { status: 503 },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if(process.env.QA_SYNTHETIC==="true"){
    if(!await hasPermission(request,"research"))return NextResponse.json({error:"Research permission required."},{status:403});
    const row=(await previewScans()).find(row=>row.kind==="qa_keyword_scan"&&row.id===id&&row.status!=="deleted");
    return row?NextResponse.json({ok:true,fromCache:true,synthetic:true,result:{...row.payload,fetchedAt:row.payload.fetchedAt??row.createdAt}}):NextResponse.json({error:"Saved search not found."},{status:404});
  }
  if (!hasDatabase()) return unavailable();
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid scan id." }, { status: 400 });
  }
  try {
    const [row] = await db()
      .select()
      .from(schema.keywordScans)
      .where(eq(schema.keywordScans.id, id))
      .limit(1);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Saved search not found." }, { status: 404 });
    }
    if (row.siteSlug && !await canAccessSite(request, row.siteSlug)) return NextResponse.json({ ok: false, error: "Saved search not found." }, { status: 404 });
    if(!await hasPermission(request,"research",row.siteSlug))return NextResponse.json({error:"Research permission required."},{status:403});
    let meta:{pagination?:KeywordResearchResult["pagination"];fetchedAt?:string}={};try{if(row.sourceValue?.startsWith("{"))meta=JSON.parse(row.sourceValue);}catch{}
    const result: KeywordResearchResult = {
      pagination:meta.pagination,
      seed: row.seed,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      locationLabel: row.locationLabel,
      fetchedAt: meta.fetchedAt??row.createdAt.toISOString(),
      rows: (row.rows ?? []) as KeywordResearchRow[],
    };
    return NextResponse.json({ ok: true, configured: true, fromCache: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load saved search." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if(process.env.QA_SYNTHETIC==="true"){
    if(!await hasPermission(request,"research"))return NextResponse.json({error:"Research permission required."},{status:403});const row=(await previewScans()).find(row=>row.id===id&&row.kind==="qa_keyword_scan");if(!row)return NextResponse.json({error:"Saved search not found."},{status:404});await saveCommandRecord(row.siteSlug,row.kind,row.recordKey,row.payload,{status:"deleted"});return NextResponse.json({ok:true,synthetic:true});
  }
  if (!hasDatabase()) return unavailable();
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid scan id." }, { status: 400 });
  }
  try {
    const [existing] = await db().select({ siteSlug: schema.keywordScans.siteSlug }).from(schema.keywordScans).where(eq(schema.keywordScans.id, id)).limit(1);
    if (!existing || (existing.siteSlug && !await canAccessSite(request, existing.siteSlug))) return NextResponse.json({ ok: false, error: "Saved search not found." }, { status: 404 });
    if (!await hasPermission(request, "research", existing.siteSlug)) return NextResponse.json({ ok: false, error: "Research permission required." }, { status: 403 });
    const deleted = await db()
      .delete(schema.keywordScans)
      .where(eq(schema.keywordScans.id, id))
      .returning({ id: schema.keywordScans.id });
    if (deleted.length === 0) {
      return NextResponse.json({ ok: false, error: "Saved search not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to delete saved search." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!UUID_RE.test(id) || typeof body?.label !== "string" || !body.label.trim() || body.label.trim().length > 160 || !(body.expectedLabel === null || typeof body.expectedLabel === "string")) return NextResponse.json({ error: "Enter a list name and reload the saved version before renaming." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    const row = (await previewScans()).find(row => row.id === id && row.kind === "qa_keyword_scan" && row.status !== "deleted");
    if (!row || (row.siteSlug !== "__qa_research__" && !await canAccessSite(request, row.siteSlug))) return NextResponse.json({ error: "Saved search not found." }, { status: 404 });
    if (!await hasPermission(request, "research", row.siteSlug === "__qa_research__" ? null : row.siteSlug)) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
    if ((row.payload.label ?? null) !== body.expectedLabel) return NextResponse.json({ error: "This list was renamed in another session. Reload before saving." }, { status: 409 });
    await saveCommandRecord(row.siteSlug, row.kind, row.recordKey, { ...row.payload, label: body.label.trim() });
    return NextResponse.json({ ok: true });
  }
  if (!hasDatabase()) return unavailable();
  const [row] = await db().select().from(schema.keywordScans).where(eq(schema.keywordScans.id, id)).limit(1);
  if (!row || (row.siteSlug && !await canAccessSite(request, row.siteSlug))) return NextResponse.json({ error: "Saved search not found." }, { status: 404 });
  if (!await hasPermission(request, "research", row.siteSlug)) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
  const { and, isNull } = await import("drizzle-orm");
  const changed = await db().update(schema.keywordScans).set({ label: body.label.trim() }).where(and(eq(schema.keywordScans.id, id), body.expectedLabel === null ? isNull(schema.keywordScans.label) : eq(schema.keywordScans.label, body.expectedLabel))).returning({ id: schema.keywordScans.id });
  return changed.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This list was renamed in another session. Reload before saving." }, { status: 409 });
}
