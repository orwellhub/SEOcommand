import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { canAccessSite } from "@/platform/access";
import { buildSerpIntelligence, type SerpHistoryRow } from "@/platform/serp-intelligence";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site")?.trim() ?? "";
  if (!site) return NextResponse.json({ error: "Choose a website first." }, { status: 400 });
  if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ...buildSerpIntelligence(qaRows()), synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "SERP intelligence requires DATABASE_URL." }, { status: 503 });
  const rows = await db().select({ trackedKeywordId: schema.dailyRankHistory.trackedKeywordId, keyword: schema.rankTrackingKeywords.keyword, capturedOn: schema.dailyRankHistory.capturedOn, position: schema.dailyRankHistory.position, previousPosition: schema.dailyRankHistory.previousPosition, url: schema.dailyRankHistory.url, serpFeatures: schema.dailyRankHistory.serpFeatures, ownedFeatures: schema.dailyRankHistory.ownedFeatures, intent: schema.dailyRankHistory.intent, competitors: schema.dailyRankHistory.competitors, device: schema.rankTrackingKeywords.device, locationCode: schema.rankTrackingKeywords.locationCode }).from(schema.dailyRankHistory).innerJoin(schema.rankTrackingKeywords, eq(schema.rankTrackingKeywords.id, schema.dailyRankHistory.trackedKeywordId)).where(eq(schema.dailyRankHistory.siteSlug, site)).orderBy(asc(schema.dailyRankHistory.capturedOn)).limit(30_000);
  return NextResponse.json(buildSerpIntelligence(rows));
}

function qaRows(): SerpHistoryRow[] {
  const keywords = ["compare mortgages uae", "first time buyer mortgage", "mortgage calculator", "best mortgage rates", "remortgage dubai", "islamic mortgage uae"];
  return Array.from({ length: 8 }, (_, week) => keywords.map((keyword, index) => { const date = new Date(Date.UTC(2026, 6, 6 + week * 7)).toISOString().slice(0, 10); const base = 18 - index * 2; const position = Math.max(1, base - week + ((week + index) % 3)); const intent = week >= 5 && index === 1 ? "transactional" : /best|compare/.test(keyword) ? "commercial" : /calculator/.test(keyword) ? "transactional" : "informational"; return { trackedKeywordId: `77000000-0000-4000-8000-00000000000${index + 1}`, keyword, capturedOn: date, position, previousPosition: week ? Math.max(1, base - week + 1) : null, url: `https://mortgagecompare.example/${keyword.replace(/\s+/g, "-")}`, serpFeatures: index % 2 ? ["organic", "people_also_ask"] : ["organic", "featured_snippet", "people_also_ask"], ownedFeatures: week >= 6 && index === 0 ? ["featured_snippet"] : [], intent, competitors: [{ host: week >= 6 && index < 2 ? "newcomer.example" : "leader.example", position: 1, url: null }, { host: "bank.example", position: 2 + index % 3, url: null }], device: index % 2 ? "mobile" : "desktop", locationCode: 2784 }; })).flat();
}
