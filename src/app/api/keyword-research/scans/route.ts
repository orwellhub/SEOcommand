import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { KeywordResearchRow } from "@/lib/types";
import { canAccessSite, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saved keyword-research scans.
 *
 * GET  → recent scans, metadata only (no result rows) for the history list.
 * POST → save a completed scan, rows included.
 *
 * Storing the rows means reopening a past search costs nothing: it is served
 * from Postgres and never re-queries DataForSEO.
 */

const MAX_ROWS = 1000;
const LIST_LIMIT = 50;

const RowSchema = z
  .object({
    keyword: z.string().min(1).max(400),
    volume: z.number().nullable(),
    difficulty: z.number().nullable(),
    cpc: z.number().nullable(),
    competition: z.number().nullable(),
    competitionLevel: z.enum(["low", "medium", "high"]).nullable(),
    intent: z
      .enum(["informational", "navigational", "commercial", "transactional"])
      .nullable(),
    lowTopBid: z.number().nullable(),
    highTopBid: z.number().nullable(),
    trend: z.array(z.number()),
    monthlySearches: z.array(
      z.object({ year: z.number(), month: z.number(), volume: z.number() }),
    ),
  })
  .passthrough();

const SaveSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  siteSlug: z.string().max(120).nullable().optional(),
  label: z.string().max(160).nullable().optional(),
  sourceType: z.string().max(40).optional(),
  sourceValue: z.string().max(500).nullable().optional(),
  seed: z.string().min(1).max(200),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(10),
  locationLabel: z.string().min(1).max(120),
  rows: z.array(RowSchema).min(1).max(MAX_ROWS),
});

function unavailable() {
  return NextResponse.json(
    { ok: false, error: "Saved searches require DATABASE_URL." },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const siteSlug = new URL(request.url).searchParams.get("site")?.trim() || null;
    if (siteSlug && !await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
    if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, scans: [], synthetic: true });
    if (!hasDatabase()) return unavailable();
    const query = db()
      .select({
        id: schema.keywordScans.id,
        projectId: schema.keywordScans.projectId,
        siteSlug: schema.keywordScans.siteSlug,
        label: schema.keywordScans.label,
        sourceType: schema.keywordScans.sourceType,
        seed: schema.keywordScans.seed,
        locationCode: schema.keywordScans.locationCode,
        languageCode: schema.keywordScans.languageCode,
        locationLabel: schema.keywordScans.locationLabel,
        rowCount: schema.keywordScans.rowCount,
        totalVolume: schema.keywordScans.totalVolume,
        avgDifficulty: schema.keywordScans.avgDifficulty,
        createdBy: schema.keywordScans.createdBy,
        createdAt: schema.keywordScans.createdAt,
      })
      .from(schema.keywordScans)
      .$dynamic();
    const scans = await (siteSlug ? query.where(eq(schema.keywordScans.siteSlug, siteSlug)) : query)
      .orderBy(desc(schema.keywordScans.createdAt)).limit(LIST_LIMIT);
    return NextResponse.json({ ok: true, scans });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to list saved searches." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof SaveSchema>;
  try {
    parsed = SaveSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof z.ZodError ? err.issues[0]?.message : "Invalid body." },
      { status: 400 },
    );
  }

  if (parsed.siteSlug && !await canAccessSite(request, parsed.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "research", parsed.siteSlug)) return NextResponse.json({ error: "Research permission required." }, { status: 403 });

  if (process.env.QA_SYNTHETIC === "true") {
    const volumes = parsed.rows.map((row) => row.volume).filter((value): value is number => value != null);
    const difficulties = parsed.rows.map((row) => row.difficulty).filter((value): value is number => value != null);
    const encodedSeed = Buffer.from(parsed.seed).toString("base64url");
    return NextResponse.json({
      ok: true,
      synthetic: true,
      scan: {
        id: `qa-${encodedSeed}-${parsed.locationCode}`,
        seed: parsed.seed,
        locationCode: parsed.locationCode,
        languageCode: parsed.languageCode,
        locationLabel: parsed.locationLabel,
        rowCount: parsed.rows.length,
        totalVolume: volumes.reduce((total, value) => total + value, 0),
        avgDifficulty: difficulties.length ? Math.round(difficulties.reduce((total, value) => total + value, 0) / difficulties.length) : null,
        createdBy: request.headers.get("x-orwell-user-email"),
        createdAt: new Date().toISOString(),
      },
    });
  }
  if (!hasDatabase()) return unavailable();

  const rows = parsed.rows as unknown as KeywordResearchRow[];
  const volumes = rows.map((r) => r.volume).filter((v): v is number => v != null);
  const difficulties = rows.map((r) => r.difficulty).filter((v): v is number => v != null);

  try {
    const [saved] = await db()
      .insert(schema.keywordScans)
      .values({
        projectId: parsed.projectId ?? null,
        siteSlug: parsed.siteSlug ?? null,
        label: parsed.label ?? null,
        sourceType: parsed.sourceType ?? "seed",
        sourceValue: parsed.sourceValue ?? parsed.seed,
        seed: parsed.seed,
        locationCode: parsed.locationCode,
        languageCode: parsed.languageCode,
        locationLabel: parsed.locationLabel,
        rows,
        rowCount: rows.length,
        totalVolume: volumes.reduce((a, b) => a + b, 0),
        avgDifficulty: difficulties.length
          ? Math.round(difficulties.reduce((a, b) => a + b, 0) / difficulties.length)
          : null,
        createdBy: request.headers.get("x-orwell-user-email"),
      })
      .returning({ id: schema.keywordScans.id, createdAt: schema.keywordScans.createdAt });
    return NextResponse.json({ ok: true, scan: saved });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to save search." },
      { status: 500 },
    );
  }
}
