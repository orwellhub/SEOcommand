import { NextResponse } from "next/server";
import { buildAiVisibilityDashboard } from "@/platform/ai-read-model";
import { getManagedSite, listManagedSites, listPortfolioGroups, resolveGroupSiteSlugs } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";
import { qaAiVisibility } from "@/data/qa-fixtures";
import { filterAccessibleSiteSlugs } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopeId = url.searchParams.get("scope") ?? "portfolio";
  const requestedDays = Number(url.searchParams.get("days") ?? "90");
  const days = Number.isFinite(requestedDays) ? Math.min(365, Math.max(7, Math.floor(requestedDays))) : 90;
  const platform = url.searchParams.get("platform") || undefined;
  if (platform && !["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"].includes(platform)) return NextResponse.json({ error: "Choose a supported AI platform." }, { status: 400 });
  let label = "Portfolio";
  let requested: string[];
  if (scopeId === "portfolio") {
    const sites = await listManagedSites();
    requested = sites.map((site) => site.id);
  } else if (scopeId.startsWith("group:")) {
    const groupId = scopeId.slice(6);
    const group = (await listPortfolioGroups()).find((item) => item.id === groupId);
    if (!group) return NextResponse.json({ error: "Portfolio group not found." }, { status: 404 });
    label = group.name;
    requested = await resolveGroupSiteSlugs(groupId);
  } else {
    const site = await getManagedSite(scopeId);
    if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    label = site.name;
    requested = [site.id];
  }
  const siteSlugs = await filterAccessibleSiteSlugs(request, requested);
  if (!scopeId.startsWith("group:") && scopeId !== "portfolio" && siteSlugs.length === 0) {
    return NextResponse.json({ error: "Website access required." }, { status: 403 });
  }
  if (process.env.QA_SYNTHETIC === "true") {
    const data = qaAiVisibility(scopeId, siteSlugs);
    data.scope.days = days;
    const since = new Date(); since.setUTCDate(since.getUTCDate() - (days - 1));
    data.observations = data.observations.filter(row => (!platform || row.platform === platform) && row.capturedOn >= since.toISOString().slice(0,10));
    const observations=data.observations, checks=observations.length, mentions=observations.filter(r=>r.mentioned).length, citations=observations.filter(r=>r.cited).length;
    const rate=(n:number,d:number)=>d ? Math.round(n/d*1000)/10 : 0;
    data.summary={...data.summary,checks,mentions,citedResponses:citations,citedPages:new Set(observations.flatMap(r=>r.citations.filter(c=>c.owned).map(c=>c.url))).size,mentionRate:rate(mentions,checks),citationRate:rate(citations,checks),sitesMeasured:new Set(observations.map(r=>r.siteSlug)).size};
    data.platforms=[...new Set(observations.map(r=>r.platform))].map(name=>{const rows=observations.filter(r=>r.platform===name), m=rows.filter(r=>r.mentioned).length,c=rows.filter(r=>r.cited).length;return {platform:name,checks:rows.length,mentions:m,citedResponses:c,citedPages:new Set(rows.flatMap(r=>r.citations.map(c=>c.url))).size,mentionRate:rate(m,rows.length),citationRate:rate(c,rows.length),avgPosition:rows.reduce((s,r)=>s+r.recommendationPosition,0)/rows.length};});
    data.trend=[...new Set(observations.map(r=>r.capturedOn))].sort().map(date=>{const rows=observations.filter(r=>r.capturedOn===date),m=rows.filter(r=>r.mentioned).length,c=rows.filter(r=>r.cited).length;return {date,mentions:m,citedResponses:c,citedPages:new Set(rows.flatMap(r=>r.citations.map(c=>c.url))).size,mentionRate:rate(m,rows.length),citationRate:rate(c,rows.length),shareOfVoice:0};});
    data.countries=[];
    if(!checks){data.sources=[];data.competitors=[];data.recommendations=[];data.summary.avgRecommendationPosition=null;data.summary.positiveSentimentRate=0;data.summary.shareOfVoice=0;}
    return NextResponse.json(data);
  }
  if (!hasDatabase()) return NextResponse.json({ error: "AI history requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json(await buildAiVisibilityDashboard({ id: scopeId, label, siteSlugs }, days, { platform }));
}
