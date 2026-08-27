import { NextResponse, type NextRequest } from "next/server";
import { dataForSeoConfigured, researchKeywords } from "@/providers/dataforseo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { DEFAULT_MARKET, marketByCode, marketLabel } from "@/lib/markets";
import { isoDate } from "@/lib/dates";
import type { KeywordResearchResult } from "@/lib/types";
import { qaKeywordResearch } from "@/data/qa-fixtures";
import { canAccessSite, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Seed keyword research via the cost-guarded DataForSEO provider.
 *
 * Returns { ok:false, configured:false } — never an error — when DataForSEO
 * credentials are absent, so the UI degrades gracefully with no live calls.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const seed = (params.get("seed") ?? "").trim();
  if (!seed) {
    return NextResponse.json({ ok: false, message: "A seed keyword is required." }, { status: 400 });
  }

  const requestedCode = Number(params.get("location"));
  const fallbackMarket = marketByCode(requestedCode) ?? DEFAULT_MARKET;
  const locationCode = Number.isInteger(requestedCode) && requestedCode > 0 ? requestedCode : fallbackMarket.code;
  const requestedLabel = params.get("locationLabel")?.trim();
  const locationLabel = requestedLabel || marketByCode(locationCode)?.label || marketLabel(locationCode);
  const languageCode = (params.get("language") || fallbackMarket.language).trim();
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), 1000);
  const requestedSource = params.get("sourceType");
  const sourceType = requestedSource === "domain" || requestedSource === "competitor" || requestedSource === "questions" ? requestedSource : "seed";
  const siteSlug = params.get("site")?.trim() || null;
  if (siteSlug && !await canAccessSite(req, siteSlug)) return NextResponse.json({ ok: false, message: "Website access required." }, { status: 403 });
  if (!await hasPermission(req, "research", siteSlug)) return NextResponse.json({ ok: false, message: "Research permission required." }, { status: 403 });

  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json({ ok: true, configured: true, synthetic: true, result: qaKeywordResearch(seed, locationCode, languageCode, locationLabel) });
  }

  if (!dataForSeoConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message:
        "DataForSEO is not connected yet. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to run a live scan.",
    });
  }

  try {
    const rows = await researchKeywords({
      seed,
      sourceType,
      siteSlug,
      locationCode,
      languageCode,
      limit,
    });
    const result: KeywordResearchResult = {
      seed,
      locationCode,
      languageCode,
      locationLabel,
      fetchedAt: isoDate(new Date()),
      rows,
    };
    return NextResponse.json({ ok: true, configured: true, result });
  } catch (err) {
    const status = err instanceof BudgetExceededError || err instanceof DailyLimitError ? 429 : 502;
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: err instanceof Error ? err.message : "Keyword research failed.",
      },
      { status },
    );
  }
}
