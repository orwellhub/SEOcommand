import {NextResponse} from "next/server";
import {z} from "zod";
import {canAccessSite,hasPermission} from "@/platform/access";
import {getManagedSite} from "@/platform/site-store";
import {workspaceRecords,saveWorkspace} from "@/platform/workspace-store";
import {getDataForSeoClient} from "@/providers/dataforseo";
import {ENDPOINTS} from "@/providers/dataforseo/config";
import {cleanCompetitorHost} from "@/platform/competitive-intelligence";
import {normalizeAdvertising} from "@/lib/advertising";
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!await getManagedSite(site)||!await canAccessSite(request,site)||!await hasPermission(request,"research",site))return NextResponse.json({error:"Website research access required."},{status:403});return NextResponse.json({records:await workspaceRecords(site,"advertising")});}
const Input=z.object({site:z.string(),domain:z.string().min(3).max(253),locationCode:z.number().int().positive(),languageCode:z.string().min(2).max(12),kind:z.enum(["keywords","competitors","pages"])});
export async function POST(request:Request){const parsed=Input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a domain, database and advertising report."},{status:400});const input=parsed.data;if(!await getManagedSite(input.site)||!await canAccessSite(request,input.site)||!await hasPermission(request,"research",input.site))return NextResponse.json({error:"Website research access required."},{status:403});if(process.env.QA_SYNTHETIC==="true")return NextResponse.json({error:"Paid advertising collection is disabled in the synthetic preview."},{status:409});
 try{const domain=cleanCompetitorHost(input.domain),endpoint=input.kind==="keywords"?"labsRankedKeywords":input.kind==="competitors"?"labsCompetitorsDomain":"labsRelevantPages",call=await getDataForSeoClient().post<Record<string,unknown>>(endpoint,ENDPOINTS[endpoint],[{target:domain,item_types:["paid"],location_code:input.locationCode,language_code:input.languageCode,limit:100}],{domainSlug:input.site});
 const record=await saveWorkspace(input.site,"advertising",crypto.randomUUID(),{input:{...input,domain},rows:normalizeAdvertising(call.result,input.kind),costUsd:call.costUsd,total:typeof call.result[0]?.total_count==="number"?call.result[0].total_count:null,collectedAt:new Date().toISOString()},"completed");return NextResponse.json({record});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Advertising collection failed. Review collection history before repeating a paid request."},{status:502});}}
