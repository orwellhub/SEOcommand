import { NextResponse, type NextRequest } from "next/server";
import { buildXlsx, type XlsxColumn } from "@/lib/xlsx";
import type { KeywordResearchRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turn already-fetched keyword rows into a downloadable .xlsx. This deliberately
 * does NOT re-query DataForSEO — it formats the rows the client already holds,
 * so exporting never incurs a second paid API call.
 */

const COLUMNS: XlsxColumn[] = [
  { header: "Keyword", key: "keyword" },
  { header: "Search volume", key: "volume" },
  { header: "Keyword difficulty", key: "difficulty" },
  { header: "CPC (USD)", key: "cpc" },
  { header: "Competition (0-1)", key: "competition" },
  { header: "Competition level", key: "competitionLevel" },
  { header: "Search intent", key: "intent" },
  { header: "Low top-of-page bid (USD)", key: "lowTopBid" },
  { header: "High top-of-page bid (USD)", key: "highTopBid" },
  { header: "Monthly searches (YYYY-MM:volume)", key: "monthly" },
];

function slug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "scan"
  );
}

interface ExportBody {
  seed?: string;
  locationLabel?: string;
  fetchedAt?: string;
  rows?: KeywordResearchRow[];
}

export async function POST(req: NextRequest) {
  let body: ExportBody;
  try {
    body = (await req.json()) as ExportBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, message: "No keyword rows to export." }, { status: 400 });
  }

  const sheetRows = rows.map((r) => ({
    keyword: r.keyword,
    volume: r.volume,
    difficulty: r.difficulty,
    cpc: r.cpc,
    competition: r.competition,
    competitionLevel: r.competitionLevel ?? "",
    intent: r.intent ?? "",
    lowTopBid: r.lowTopBid,
    highTopBid: r.highTopBid,
    monthly: (r.monthlySearches ?? [])
      .map((m) => `${m.year}-${String(m.month).padStart(2, "0")}:${m.volume}`)
      .join("; "),
  }));

  const bytes = buildXlsx({
    name: "Keyword Research",
    columns: COLUMNS,
    rows: sheetRows,
  });

  const seed = slug(body.seed ?? "keywords");
  const date = (body.fetchedAt ?? new Date().toISOString()).slice(0, 10);
  const filename = `keyword-research-${seed}-${date}.xlsx`;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
