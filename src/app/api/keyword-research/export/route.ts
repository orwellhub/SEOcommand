import { keywordGroups, keywordWords, type WorkbenchKeyword } from "@/lib/keyword-workbench";
import { NextResponse, type NextRequest } from "next/server";
import { buildXlsxWorkbook, type XlsxColumn, type XlsxSheet } from "@/lib/xlsx";
import type { KeywordResearchRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turn already-fetched keyword rows into a downloadable .xlsx. This deliberately
 * does NOT re-query DataForSEO — it formats the rows the client already holds,
 * so exporting never incurs a second paid API call.
 */

const COLUMNS: XlsxColumn[] = [
  { header: "Country", key: "marketLabel" },
  { header: "Language", key: "languageCode" },
  { header: "Metrics updated", key: "updatedAt" },
  { header: "Collected", key: "collectedAt" },
  { header: "SERP features", key: "serpFeatures" },
  { header: "Results", key: "resultCount" },
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
  rows?: (KeywordResearchRow & Partial<WorkbenchKeyword>)[];
  grouped?: boolean;
}

export async function POST(req: NextRequest) {
  let body: ExportBody;
  try {
    body = (await req.json()) as ExportBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  if(Array.isArray(body.rows)&&body.rows.length>100000)return NextResponse.json({ok:false,message:"Export up to 100,000 keyword rows at a time."},{status:400});
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, message: "No keyword rows to export." }, { status: 400 });
  }

  const sheetRows = rows.map((r) => ({
    keyword: r.keyword,
    marketLabel:r.marketLabel ?? body.locationLabel ?? "", languageCode:r.languageCode ?? "", updatedAt:r.updatedAt, collectedAt:r.collectedAt??body.fetchedAt, serpFeatures:r.serpFeatures?.join("; "), resultCount:r.resultCount,
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

  const sheets: XlsxSheet[] = [{name:"Keyword Research",columns:COLUMNS,rows:sheetRows}];
  if(body.grouped){
    const groups=keywordGroups(rows as WorkbenchKeyword[],body.seed??"");
    sheets.push({name:"Groups",columns:[{header:"Group (collected rows)",key:"term"},{header:"Keywords",key:"count"},{header:"Known volume",key:"volume"}],rows:groups});
    sheets.push({name:"Group membership",columns:[{header:"Group",key:"group"},...COLUMNS],rows:sheetRows.flatMap(row=>{const terms=new Set(keywordWords(row.keyword));const matches=groups.filter(group=>terms.has(group.term));return matches.length?matches.map(group=>({...row,group:group.term})):[{...row,group:"Ungrouped"}];})});
  }
  const bytes = buildXlsxWorkbook(sheets);

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
