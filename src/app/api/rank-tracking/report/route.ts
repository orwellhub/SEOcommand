import { buildDomainBundle } from "@/sync/bundle";
import { volumeKey } from "@/lib/rank-intelligence";
import {NextResponse} from "next/server";
import {and,desc,eq,gte,lte} from "drizzle-orm";
import {db,schema} from "@/db";
import {canAccessSite} from "@/platform/access";
import {hasDatabase} from "@/sync/store";
import {rankPreview} from "@/platform/rank-preview";
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,site=params.get("site")??"";
 if(!site||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});
 const from=params.get("from")??new Date(Date.now()-90*86400000).toISOString().slice(0,10),to=params.get("to")??new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||from>to)return NextResponse.json({error:"Choose a valid date interval."},{status:400});
 if(process.env.QA_SYNTHETIC==="true"){const workspace=await rankPreview(site);return NextResponse.json({...workspace,volumes: Object.fromEntries(workspace.keywords.map((k, i) => [volumeKey(k), 100 + i * 50])),history:workspace.history.filter(row=>row.capturedOn>=from&&row.capturedOn<=to),from,to,synthetic:true});}
 if(!hasDatabase())return NextResponse.json({error:"Rank tracking storage is unavailable."},{status:503});
 const [campaigns,keywords,history]=await Promise.all([
 db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.siteSlug,site)).orderBy(desc(schema.rankTrackingCampaigns.updatedAt)),
 db().select().from(schema.rankTrackingKeywords).where(eq(schema.rankTrackingKeywords.siteSlug,site)).limit(10001),
 db().select().from(schema.dailyRankHistory).where(and(eq(schema.dailyRankHistory.siteSlug,site),gte(schema.dailyRankHistory.capturedOn,from),lte(schema.dailyRankHistory.capturedOn,to))).orderBy(desc(schema.dailyRankHistory.capturedOn)).limit(100001)]);
 const snapshot = (await buildDomainBundle(site)).datasets.keywords;
 const market = snapshot?.provenance.location?.match(/location (\d+) \/ ([a-z-]+)/i);
 const volumes = market ? Object.fromEntries((snapshot?.data ?? []).filter(k => Number.isFinite(k.volume) && k.volume >= 0).map(k => [volumeKey({ keyword: k.keyword, locationCode: Number(market[1]), languageCode: market[2]! }), k.volume])) : {};
 return NextResponse.json({volumes,volumeCollectedAt:snapshot?.provenance.collectedAt??null,campaigns,keywords:keywords.slice(0,10000),history:history.slice(0,100000),truncated:history.length>100000||keywords.length>10000,from,to});
}
