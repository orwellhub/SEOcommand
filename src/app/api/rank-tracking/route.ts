import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";
import {rankPreview,saveRankPreview} from "@/platform/rank-preview";
import {cleanCompetitorHost} from "@/platform/competitive-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddSchema = z.object({
  siteSlug: z.string().min(1).max(120),
  campaignId: z.string().uuid().nullable().optional(),
  campaignName: z.string().min(2).max(120).optional(),
  cadence: z.enum(["daily", "weekly"]).default("weekly"),
  searchEngine: z.literal("google").default("google"),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(10).default("en"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  keywords: z.array(z.object({ keyword: z.string().trim().min(1).max(400), targetUrl: z.string().url().regex(/^https?:\/\//).max(2000).nullable().optional(), tags: z.array(z.string()).optional() })).min(1).max(500),
});

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim();
  if (!siteSlug) return NextResponse.json({ error: "Choose a website first." }, { status: 400 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, ...await rankPreview(siteSlug), synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "Rank tracking requires DATABASE_URL." }, { status: 503 });
  const [campaigns, keywords] = await Promise.all([
    db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.siteSlug, siteSlug)).orderBy(desc(schema.rankTrackingCampaigns.updatedAt)).limit(100),
    db().select().from(schema.rankTrackingKeywords).where(eq(schema.rankTrackingKeywords.siteSlug, siteSlug)).orderBy(desc(schema.rankTrackingKeywords.createdAt)).limit(5_000),
  ]);
  return NextResponse.json({ ok: true, campaigns, keywords });
}

export async function POST(request: Request) {
  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid tracking request." }, { status: 400 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "research", parsed.data.siteSlug)) return NextResponse.json({ error: "Research permission required for this website." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    const workspace=await rankPreview(parsed.data.siteSlug),campaignId=parsed.data.campaignId??crypto.randomUUID();
    if(parsed.data.campaignId&&!workspace.campaigns.some(row=>row.id===campaignId))return NextResponse.json({error:"Campaign not found."},{status:404});
    if(!parsed.data.campaignId)workspace.campaigns.push({id:campaignId,name:parsed.data.campaignName??"Research tracking",competitors:[],defaultCadence:parsed.data.cadence,alertThreshold:5,updatedAt:new Date().toISOString()});
    const beforeCount=workspace.keywords.length;
    for(const item of parsed.data.keywords)if(!workspace.keywords.some(row=>row.keyword===item.keyword&&row.device===parsed.data.device&&row.locationCode===parsed.data.locationCode))workspace.keywords.push({id:crypto.randomUUID(),...parsed.data,...item,campaignId,targetUrl:item.targetUrl??null,tags:item.tags??[],active:true});
    await saveRankPreview(parsed.data.siteSlug,workspace);return NextResponse.json({ok:true,campaignId,synthetic:true,added:workspace.keywords.length-beforeCount,skipped:parsed.data.keywords.length-(workspace.keywords.length-beforeCount)},{status:201});
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Rank tracking requires DATABASE_URL." }, { status: 503 });
  let campaignId = parsed.data.campaignId ?? null;
  if (!campaignId) {
    const [campaign] = await db().insert(schema.rankTrackingCampaigns).values({ siteSlug: parsed.data.siteSlug, name: parsed.data.campaignName ?? `Research · ${new Date().toLocaleDateString("en-GB")}`, defaultCadence: parsed.data.cadence, searchEngine: parsed.data.searchEngine, updatedAt:new Date(), createdBy: request.headers.get("x-orwell-user-email") }).returning();
    campaignId = campaign!.id;
  } else {
    const [campaign] = await db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.id, campaignId)).limit(1);
    if (!campaign || campaign.siteSlug !== parsed.data.siteSlug) return NextResponse.json({ error: "Tracking campaign not found." }, { status: 404 });
  }
  const inserted = await db().insert(schema.rankTrackingKeywords).values(parsed.data.keywords.map((item) => ({ siteSlug: parsed.data.siteSlug, campaignId, keyword: item.keyword, locationCode: parsed.data.locationCode, languageCode: parsed.data.languageCode, device: parsed.data.device, targetUrl: item.targetUrl ?? null, tags: item.tags ?? [], cadence: parsed.data.cadence, searchEngine: parsed.data.searchEngine }))).onConflictDoNothing().returning({ id: schema.rankTrackingKeywords.id });
  return NextResponse.json({ ok: true, campaignId, added: inserted.length, skipped: parsed.data.keywords.length - inserted.length }, { status: 201 });
}

const EditSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("campaign"),siteSlug:z.string().min(1),id:z.string().uuid(),updatedAt:z.string().datetime(),name:z.string().trim().min(2).max(120),competitors:z.array(z.string().max(253)).max(20),alertThreshold:z.number().int().min(1).max(100),defaultCadence:z.enum(["daily","weekly"])}),
 z.object({kind:z.literal("keywords"),siteSlug:z.string().min(1),ids:z.array(z.string().uuid()).min(1).max(500),active:z.boolean().optional(),tags:z.array(z.string().trim().min(1).max(60)).max(30).optional(),cadence:z.enum(["daily","weekly"]).optional(),targetUrl:z.string().url().regex(/^https?:\/\//).max(2000).nullable().optional()})]);
export async function PATCH(request:Request){
 const parsed=EditSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Check the campaign or keyword changes."},{status:400});
 const input=parsed.data;if(!await canAccessSite(request,input.siteSlug)||!await hasPermission(request,"research",input.siteSlug))return NextResponse.json({error:"Research permission required."},{status:403});
 if(input.kind==="campaign"){try{input.competitors=[...new Set(input.competitors.filter(value=>value.trim()).map(cleanCompetitorHost))];}catch{return NextResponse.json({error:"Enter valid competitor domains."},{status:400});}}
 const changes=input.kind==="campaign"?{name:input.name,competitors:input.competitors,defaultCadence:input.defaultCadence,alertThreshold:input.alertThreshold,updatedAt:new Date()}:Object.fromEntries(Object.entries(input).filter(([key])=>["active","tags","cadence","targetUrl"].includes(key)));
 if(input.kind==="keywords"&&Object.keys(changes).length===0)return NextResponse.json({error:"Choose a change to apply."},{status:400});
 if(process.env.QA_SYNTHETIC==="true"){
   const workspace=await rankPreview(input.siteSlug);
   if(input.kind==="campaign"){const found=workspace.campaigns.find(row=>row.id===input.id);if(!found||found.updatedAt!==input.updatedAt)return NextResponse.json({error:"Campaign changed. Reload before saving."},{status:409});Object.assign(found,changes,{updatedAt:new Date().toISOString()});}
   else {if(input.ids.some(id=>!workspace.keywords.some(row=>row.id===id)))return NextResponse.json({error:"Keyword not found."},{status:404});workspace.keywords=workspace.keywords.map(row=>input.ids.includes(row.id)?{...row,...changes}:row);}
   await saveRankPreview(input.siteSlug,workspace);return NextResponse.json({ok:true,synthetic:true});
 }
 if(!hasDatabase())return NextResponse.json({error:"Rank tracking storage is unavailable."},{status:503});
 if(input.kind==="campaign"){
   const rows=await db().update(schema.rankTrackingCampaigns).set(changes).where(and(eq(schema.rankTrackingCampaigns.id,input.id),eq(schema.rankTrackingCampaigns.siteSlug,input.siteSlug),sql`date_trunc('milliseconds', ${schema.rankTrackingCampaigns.updatedAt}) = ${new Date(input.updatedAt)}`)).returning({id:schema.rankTrackingCampaigns.id});
   if(!rows.length)return NextResponse.json({error:"Campaign changed. Reload before saving."},{status:409});
 }else {
   const filter=and(eq(schema.rankTrackingKeywords.siteSlug,input.siteSlug),inArray(schema.rankTrackingKeywords.id,input.ids));
   const result=await db().transaction(async tx=>{const rows=await tx.select({id:schema.rankTrackingKeywords.id}).from(schema.rankTrackingKeywords).where(filter);if(rows.length!==new Set(input.ids).size)return false;await tx.update(schema.rankTrackingKeywords).set(changes as Partial<typeof schema.rankTrackingKeywords.$inferInsert>).where(filter);return true;});
   if(!result)return NextResponse.json({error:"Some selected keywords were not found in this website."},{status:404});
 }
 return NextResponse.json({ok:true});
}
