import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { KeywordResearchResult, KeywordResearchRow } from "@/lib/types";
import { qaKeywordResearch } from "@/data/qa-fixtures";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "Saved searches require DATABASE_URL." },
    { status: 503 },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.QA_SYNTHETIC === "true" && id.startsWith("qa-")) {
    const pieces = id.split("-");
    const locationCode = Number(pieces.pop());
    const seed = Buffer.from(pieces.slice(1).join("-"), "base64url").toString("utf8");
    return NextResponse.json({
      ok: true,
      configured: true,
      fromCache: true,
      synthetic: true,
      result: qaKeywordResearch(seed || "mortgage comparison", locationCode || 2784, "en", locationCode === 2826 ? "United Kingdom" : "United Arab Emirates"),
    });
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
    const result: KeywordResearchResult = {
      seed: row.seed,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      locationLabel: row.locationLabel,
      fetchedAt: row.createdAt.toISOString().slice(0, 10),
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
  if (process.env.QA_SYNTHETIC === "true" && id.startsWith("qa-")) {
    if (!await hasPermission(request, "research")) return NextResponse.json({ ok: false, error: "Research permission required." }, { status: 403 });
    return NextResponse.json({ ok: true, synthetic: true });
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
