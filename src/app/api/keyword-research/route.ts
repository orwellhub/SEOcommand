import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { dataForSeoConfigured, researchKeywords, keywordMetrics, keywordGlobalVolume } from "@/providers/dataforseo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { DEFAULT_MARKET, marketByCode, marketLabel, isKeywordDatabase } from "@/lib/markets";
import { DEFAULT_KEYWORD_QUERY, KeywordQuerySchema, providerKeywordQuery } from "@/lib/keyword-query";
import { filterKeywords } from "@/lib/keyword-workbench";
import { unmeasuredKeyword } from "@/lib/keyword-lists";
import type { KeywordResearchResult } from "@/lib/types";
import { qaKeywordResearch } from "@/data/qa-fixtures";
import { canAccessSite, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function access(req: Request, site: string | null) {
  if (site && !await canAccessSite(req, site)) return NextResponse.json({ok:false, message:"Website access required."}, {status:403});
  if (!await hasPermission(req, "research", site)) return NextResponse.json({ok:false, message:"Research permission required."}, {status:403});
}
function failed(error: unknown, validation = false) {
  return NextResponse.json({ok:false, message:error instanceof Error ? error.message : "Keyword research failed."}, {status:validation || error instanceof z.ZodError ? 400 : error instanceof BudgetExceededError || error instanceof DailyLimitError ? 429 : 502});
}
function disconnected() {return NextResponse.json({ok:false, configured:false, message:"Connect DataForSEO in Settings to collect keyword research."});}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const seed = (params.get("seed") ?? "").trim();
  const siteSlug = params.get("site")?.trim() || null;
  const denied = await access(req, siteSlug); if (denied) return denied;
  const requestedCode = Number(params.get("location"));
  const fallback = marketByCode(requestedCode) ?? DEFAULT_MARKET;
  const locationCode = Number.isInteger(requestedCode) && requestedCode > 0 ? requestedCode : fallback.code;
  const locationLabel = params.get("locationLabel")?.trim() || marketLabel(locationCode);
  const languageCode = (params.get("language") || fallback.language).trim();
  const limit = Math.min(Math.max(Math.floor(Number(params.get("limit")) || 100), 1), 1000);
  const offset = Number(params.get("offset") ?? 0);
  const source = params.get("sourceType");
  const sourceType = source === "domain" || source === "competitor" || source === "questions" || source === "related" ? source : "seed";
  const overview = params.get("report") === "overview" && offset === 0 && sourceType !== "domain" && sourceType !== "competitor";
  let query;
  try {
    if ((params.has("location") && (!Number.isInteger(requestedCode) || requestedCode <= 0)) || !isKeywordDatabase(locationCode)) throw new Error("Keyword research requires a supported country database. Choose a country rather than a city.");
    if (!seed || seed.length > (sourceType === "domain" || sourceType === "competitor" ? 200 : 80)) throw new Error("Enter a keyword of up to 80 characters, or a valid website.");
    if (!/^[a-z-]{2,10}$/i.test(languageCode)) throw new Error("Choose a valid language.");
    if (!Number.isInteger(offset) || offset < 0 || offset > 20000) throw new Error("Choose an offset between 0 and 20,000.");
    query = KeywordQuerySchema.parse({...DEFAULT_KEYWORD_QUERY, ...(params.has("filters") ? JSON.parse(params.get("filters")!) : {}), ...(sourceType === "questions" ? {questions:true} : {}), ...(sourceType === "related" ? {match:"related"} : {})});
    if(query.market && query.market !== `${locationCode}:${languageCode}`) throw new Error("This preset belongs to another country or language. Choose its database before applying it.");
    providerKeywordQuery(seed, query, sourceType === "domain" || sourceType === "competitor" || query.match === "related", languageCode);
  } catch (error) {return failed(error, true);}
  const result: KeywordResearchResult = {seed, locationCode, locationLabel, languageCode, fetchedAt:new Date().toISOString(), rows:[], query};
  if (process.env.QA_SYNTHETIC === "true") {
    const base = qaKeywordResearch(seed, locationCode, languageCode, locationLabel);
    const candidates = Array.from({length:240}, (_,i) => ({...base.rows[i % base.rows.length]!, keyword:i % 4 === 0 ? `how much is ${seed} ${i}` : `${seed} ${i % 2 ? "london" : "driver"} ${i}`, relatedToSeed:query.match === "related"}));
    const all = filterKeywords(candidates.map(row => ({...row, marketCode:locationCode, marketLabel:locationLabel, languageCode})), seed, query);
    result.rows = all.slice(offset, offset + limit);
    result.pagination = {nextOffset:offset + result.rows.length, total:all.length, hasMore:offset + result.rows.length < all.length, sourceType};
    result.report = {primary:base.rows.find(row=>row.keyword===seed) ?? {...base.rows[0]!,keyword:seed}};
    if (overview) for (const key of ["variations", "questions", "related"] as const) result.report[key] = {rows:candidates.filter(row => key !== "questions" || row.keyword.startsWith("how")).slice(0,5), total:key === "questions" ? 60 : 240};
    return NextResponse.json({ok:true, configured:true, synthetic:true, result});
  }
  if (!dataForSeoConfigured()) return disconnected();
  try {
    result.report = {};
    result.rows = await researchKeywords({seed, sourceType, siteSlug, locationCode, languageCode, limit, offset, offsetToken:params.get("cursor") || undefined, query, onPrimary:row=>{result.report!.primary=row;}, onPagination:page=>{result.pagination=page;}});
    const warnings: string[] = [];
    if (overview) {
      result.report.variations = {rows:result.rows.slice(0,5), total:result.pagination?.total ?? null};
      if (!result.report.primary) {
        try {result.report.primary = (await keywordMetrics([seed], locationCode, languageCode, siteSlug))[0];}
        catch {warnings.push("Exact keyword metrics could not be collected. Discovery results have been retained.");}
      }
      for (const key of ["questions", "related"] as const) {
        try {
          let total: number | null = null;
          const rows = await researchKeywords({seed, sourceType:key, siteSlug, locationCode, languageCode, limit:5, query:{...DEFAULT_KEYWORD_QUERY, ...(key === "questions" ? {questions:true} : {match:"related"})}, onPagination:page=>{total=page.total;}});
          result.report[key] = {rows, total};
        } catch (error) {warnings.push(`${key === "questions" ? "Questions" : "Related keywords"}: ${error instanceof Error ? error.message : "Collection unavailable"}. Other report sections have been retained.`);}
      }
    }
    result.report.warnings = warnings;
    result.rows=result.rows.map(row=>({...row,collectedAt:result.fetchedAt}));
    return NextResponse.json({ok:true, configured:true, result, warnings});
  } catch (error) {return failed(error);}
}

const MetricsRequest = z.object({
  action:z.enum(["metrics", "global"]), site:z.string().max(120).nullable().optional(),
  keywords:z.array(z.string().trim().min(1).max(80).refine(word=>word.split(/\s+/).length<=10, "Each keyword can contain up to 10 words.")).min(1).max(700),
  location:z.number().int().positive().refine(isKeywordDatabase,"Choose a supported country database."), language:z.string().regex(/^[a-z-]{2,10}$/i),
});
export async function POST(req: NextRequest) {
  let body;
  try {body = MetricsRequest.parse(await req.json()); if(body.action === "global" && (body.keywords.length !== 1 || body.keywords[0]!.length < 3)) throw new Error("Global demand needs one keyword of at least 3 characters.");}
  catch(error){return failed(error,true);}
  const denied = await access(req, body.site ?? null); if(denied) return denied;
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ok:true, synthetic:true, ...(body.action === "global" ? {global:{source:"clickstream", volume:12000, countries:[{code:"GB",volume:3000,percentage:25},{code:"US",volume:9000,percentage:75}], fetchedAt:new Date().toISOString()}} : {rows:body.keywords.map(keyword=>({...qaKeywordResearch(keyword,body.location,body.language,"Selected database").rows[0], keyword}))})});
  if (!dataForSeoConfigured()) return disconnected();
  try {
    if (body.action === "global") return NextResponse.json({ok:true, global:await keywordGlobalVolume(body.keywords[0]!, body.site)});
    const requested = [...new Set(body.keywords.map(word=>word.toLowerCase()))];
    const measured = new Map((await keywordMetrics(requested, body.location, body.language, body.site)).map(row=>[row.keyword.toLowerCase(),row]));
    return NextResponse.json({ok:true, rows:requested.map(word=>({...measured.get(word) ?? unmeasuredKeyword(word),collectedAt:new Date().toISOString()})), fetchedAt:new Date().toISOString()});
  } catch(error){return failed(error);}
}
