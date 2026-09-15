import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";
import { workspaceRecords } from "@/platform/workspace-store";
import type { OnPageReport } from "@/lib/on-page-analysis";
import { sessionFromRequest } from "@/lib/auth";
import { BriefSchema, CONTENT_STAGES, DueDateSchema, PublicUrlSchema, stageError } from "@/lib/content-workspace";
import { createContent, getContent, listContent, patchContent, serializeContent } from "@/platform/content-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
const metadata={title:z.string().trim().min(1).max(300),ownerEmail:z.string().trim().email().max(254).nullable(),dueDate:DueDateSchema};
const CreateSchema=z.object({site:z.string().min(1),...metadata,brief:BriefSchema.default({}),targetUrl:PublicUrlSchema.nullable().optional(),plannedUrl:z.string().trim().max(2000).nullable().optional(),analysisId:z.string().uuid().optional()});
const revision={id:z.string().uuid(),updatedAt:z.string().datetime().optional()};
const UpdateSchema=z.discriminatedUnion("action",[
 z.object({...revision,action:z.literal("update_brief"),brief:BriefSchema}),
 z.object({...revision,action:z.literal("schedule"),...metadata}),
 z.object({...revision,action:z.literal("links"),draftUrl:PublicUrlSchema.nullable(),publishedUrl:PublicUrlSchema.nullable()}),
 z.object({...revision,action:z.literal("advance"),stage:z.enum(CONTENT_STAGES),draftUrl:PublicUrlSchema.nullable().optional(),publishedUrl:PublicUrlSchema.nullable().optional()}),
]);
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!site||!await getManagedSite(site))return NextResponse.json({error:"Choose a website first."},{status:400});if(!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});try{return NextResponse.json({items:(await listContent(site)).map(serializeContent)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Content unavailable."},{status:503});}}
export async function POST(request:Request){const parsed=CreateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Add a title, valid owner email and calendar date. URLs must use HTTP or HTTPS."},{status:400});const input=parsed.data;const site=await getManagedSite(input.site);if(!site||!await canAccessSite(request,input.site)||!await hasPermission(request,"manage_content",input.site))return NextResponse.json({error:"Content permission required for this website."},{status:403});try{const analysis=input.analysisId?(await workspaceRecords(input.site,"onpage")).find(row=>row.recordKey===input.analysisId):null;
 if(input.analysisId&&!analysis?.payload.report)return NextResponse.json({error:"The selected page analysis is no longer available."},{status:404});
 const report=analysis?.payload.report as OnPageReport|undefined;
 const session=await sessionFromRequest(request);const row=await createContent({domainSlug:input.site,recommendationKey:`content:${crypto.randomUUID()}`,decision:"approved",title:input.title,module:"content",effort:"medium",priorityScore:50,status:"approved",executionType:input.targetUrl?"refresh_brief":"content_brief",ownerEmail:input.ownerEmail,dueDate:input.dueDate,targetUrl:input.targetUrl??null,plannedUrl:input.plannedUrl??null,sourceUrl:`/content?site=${input.site}&view=briefs`,sourceEvidence:{kind:"editorial_brief",createdDirectly:true},executionData:{contentStage:"brief",brief:input.brief,...(report?{contentBenchmarks:report.benchmarks,analysisId:report.id}:{}),targetKeywords:[input.brief.primaryKeyword,...input.brief.secondaryKeywords].filter(Boolean)},createdBy:session?.email??null});return NextResponse.json({item:serializeContent(row)},{status:201});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Content could not be created."},{status:503});}}
export async function PATCH(request:Request){const parsed=UpdateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Complete the content update using valid dates and HTTP or HTTPS URLs."},{status:400});try{const input=parsed.data,current=await getContent(input.id);if(!current||!await canAccessSite(request,current.domainSlug))return NextResponse.json({error:"Content work not found."},{status:404});if(!await hasPermission(request,"manage_content",current.domainSlug))return NextResponse.json({error:"Content permission required."},{status:403});if(!["content_brief","refresh_brief"].includes(current.executionType??""))return NextResponse.json({error:"Choose a content task."},{status:400});if(input.updatedAt&&input.updatedAt!==current.updatedAt.toISOString())return NextResponse.json({error:"This item changed in another session. Reopen it before saving."},{status:409});
 let saved;
 if(input.action==="schedule")saved=await patchContent(current,{title:input.title,ownerEmail:input.ownerEmail,dueDate:input.dueDate});
 else if(input.action==="update_brief")saved=await patchContent(current,{}, {brief:input.brief,targetKeywords:[input.brief.primaryKeyword,...input.brief.secondaryKeywords].filter(Boolean)});
 else if(input.action==="links"){
  if(current.executionData.contentStage==="published"&&!input.publishedUrl)return NextResponse.json({error:"A published article must retain its live URL."},{status:400});
  saved=await patchContent(current,current.executionData.contentStage==="published"?{targetUrl:input.publishedUrl}: {},{draftUrl:input.draftUrl,publishedUrl:input.publishedUrl});
 }
 else {const error=stageError(current.executionData,input.stage,input.draftUrl,input.publishedUrl);if(error)return NextResponse.json({error},{status:409});saved=await patchContent(current,input.stage==="published"?{targetUrl:input.publishedUrl??current.targetUrl,status:"done",shippedAt:new Date()}:{status:"in_progress"},{contentStage:input.stage,draftUrl:input.draftUrl??current.executionData.draftUrl??null,publishedUrl:input.publishedUrl??current.executionData.publishedUrl??null});}
 if(!saved)return NextResponse.json({error:"This item changed while saving. Reopen it and try again."},{status:409});return NextResponse.json({item:serializeContent(saved)});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Content could not be saved."},{status:503});}}
