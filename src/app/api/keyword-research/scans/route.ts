import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canWrite } from "@/lib/auth";
import { hasDatabase } from "@/sync/store";
import type { KeywordResearchRow } from "@/lib/types";

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

export async function GET() {
  if (!hasDatabase()) return unavailable();
  try {
    const scans = await db()
      .select({
        id: schema.keywordScans.id,
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
      .orderBy(desc(schema.keywordScans.createdAt))
      .limit(LIST_LIMIT);
    return NextResponse.json({ ok: true, scans });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to list saved searches." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!hasDatabase()) return unavailable();
  if (!canWrite(request.headers.get("x-orwell-user-role"))) {
    return NextResponse.json(
      { ok: false, error: "Your role does not permit saving searches." },
      { status: 403 },
    );
  }

  let parsed: z.infer<typeof SaveSchema>;
  try {
    parsed = SaveSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof z.ZodError ? err.issues[0]?.message : "Invalid body." },
      { status: 400 },
    );
  }

  const rows = parsed.rows as unknown as KeywordResearchRow[];
  const volumes = rows.map((r) => r.volume).filter((v): v is number => v != null);
  const difficulties = rows.map((r) => r.difficulty).filter((v): v is number => v != null);

  try {
    const [saved] = await db()
      .insert(schema.keywordScans)
      .values({
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
