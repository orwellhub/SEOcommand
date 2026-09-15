import {NextResponse} from "next/server";
import {z} from "zod";
import {canAccessSite,hasPermission} from "@/platform/access";
import {getManagedSite} from "@/platform/site-store";
import {workspaceRecords,saveWorkspace} from "@/platform/workspace-store";
import {getDataForSeoClient} from "@/providers/dataforseo";
import {ENDPOINTS} from "@/providers/dataforseo/config";
import {cleanCompetitorHost} from "@/platform/competitive-intelligence";
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!await getManagedSite(site)||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});return NextResponse.json({records:await workspaceRecords(site,"organic_competitors")});}
const Input=z.object({site:z.string(),domain:z.string().min(3).max(253),locationCode:z.number().int().positive(),languageCode:z.string().min(2).max(12)});
export async function POST(request:Request){const parsed=Input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a domain and search database."},{status:400});const input=parsed.data;if(!await getManagedSite(input.site)||!await canAccessSite(request,input.site)||!await hasPermission(request,"research",input.site))return NextResponse.json({error:"Research permission required."},{status:403});if(process.env.QA_SYNTHETIC==="true")return NextResponse.json({error:"Paid competitor discovery is disabled in the synthetic preview."},{status:409});
 try{const domain=cleanCompetitorHost(input.domain),call=await getDataForSeoClient().post<Record<string,unknown>>("labsCompetitorsDomain",ENDPOINTS.labsCompetitorsDomain,[{target:domain,item_types:["organic"],location_code:input.locationCode,language_code:input.languageCode,limit:100}],{domainSlug:input.site});
 const object=(value:unknown)=>value&&typeof value==="object"?value as Record<string,unknown>:{},num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
 const rows=((call.result[0]?.items??[]) as Record<string,unknown>[]).filter(row=>typeof row.domain==="string"&&row.domain!==domain).map(row=>{const organic=object(object(row.full_domain_metrics).organic);return {domain:String(row.domain),commonKeywords:num(row.intersections),relevance:num(row.relevance),keywords:num(organic.count),traffic:num(organic.etv),trafficCost:num(organic.estimated_paid_traffic_cost),averagePosition:num(row.avg_position)};});
 const record=await saveWorkspace(input.site,"organic_competitors",crypto.randomUUID(),{input:{...input,domain},rows,costUsd:call.costUsd,collectedAt:new Date().toISOString()},"completed");return NextResponse.json({record});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Competitor discovery failed."},{status:502});}}
