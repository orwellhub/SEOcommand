import {NextResponse} from "next/server";
import {z} from "zod";
import {canAccessSite,hasPermission} from "@/platform/access";
import {saveWorkspace,workspaceRecords,updateWorkspace} from "@/platform/workspace-store";
import {getDataForSeoClient} from "@/providers/dataforseo";
import {ENDPOINTS} from "@/providers/dataforseo/config";
import {normalizeResearchTarget,targetRequest,targetMatches} from "@/lib/comparison-targets";
import type {ComparisonReport,TargetCollection} from "@/lib/scoped-comparison";
const Target=z.object({value:z.string().min(3).max(2000),scope:z.enum(["domain","subdomain","folder","url"]),kind:z.enum(["organic","paid","shopping"])});
const Input=z.object({site:z.string().min(1),targets:z.array(Target).min(2).max(5),locationCode:z.number().int().positive(),languageCode:z.string().min(2).max(12),limit:z.number().int().min(1).max(1000).default(500),previousId:z.string().uuid().optional(),targetId:z.string().optional()});
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"?value as Record<string,unknown>:{};
const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
export const maxDuration=120;
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!site||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});return NextResponse.json({records:await workspaceRecords(site,"comparisons")});}
export async function POST(request:Request){const parsed=Input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose 2–5 targets and a search database."},{status:400});const input=parsed.data;if(!await canAccessSite(request,input.site)||!await hasPermission(request,"research",input.site))return NextResponse.json({error:"Website research access required."},{status:403});let targets;try{targets=input.targets.map(normalizeResearchTarget);if(new Set(targets.map(target=>target.id)).size!==targets.length)throw new Error("Choose distinct targets or keyword types.");}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Invalid target."},{status:400});}
 if(input.targetId&&!targets.some(target=>target.id===input.targetId))return NextResponse.json({error:"Unknown comparison target."},{status:400});
 const previous=input.previousId?(await workspaceRecords(input.site,"comparisons")).find(row=>row.id===input.previousId):null;
 if(input.previousId&&!previous)return NextResponse.json({error:"Saved comparison not found."},{status:404});
 const old=previous?.payload as ComparisonReport|undefined;
 if(old&&(JSON.stringify(old.input.targets)!==JSON.stringify(targets)||old.input.locationCode!==input.locationCode||old.input.languageCode!==input.languageCode))return NextResponse.json({error:"Keep the original targets and database when loading more results."},{status:400});
 const report:ComparisonReport={input:{targets,locationCode:input.locationCode,languageCode:input.languageCode},collections:old?.collections??[],collectedAt:new Date().toISOString(),costUsd:old?.costUsd??0,verification:old?.verification},key=crypto.randomUUID();
 try{for(const target of targets){if(input.targetId&&target.id!==input.targetId)continue;const prior=old?.collections.find(row=>row.target.id===target.id);if(prior?.complete)continue;
 if(target.kind==="shopping"){if(!prior)report.collections.push({target,keywords:[],total:null,offset:0,complete:false,collectedAt:new Date().toISOString()});continue;}
 const offset=prior?.offset??0;if(offset>=20000)throw new Error("This comparison has reached 20,000 collected rows per target. Narrow the scope to continue.");let items:Record<string,unknown>[],total:number|null;
 if(process.env.QA_SYNTHETIC==="true"){total=12;items=Array.from({length:Math.max(0,12-offset)},(_,i)=>({keyword_data:{keyword:`${i<6?"shared":"target "+targets.indexOf(target)} keyword ${i}`,keyword_info:{search_volume:1000-i*50},keyword_properties:{keyword_difficulty:30+i},search_intent_info:{main_intent:"commercial"}},ranked_serp_element:{serp_item:{type:target.kind,rank_group:i+1+targets.indexOf(target),url:target.scope==="url"?target.value:target.scope==="folder"?`${target.value}page-${i}`:`https://${target.host}/page-${i}`}}}));}
 else {const call=await getDataForSeoClient().post<Record<string,unknown>>("labsRankedKeywords",ENDPOINTS.labsRankedKeywords,[{...targetRequest(target),location_code:input.locationCode,language_code:input.languageCode,limit:input.limit,offset}],{domainSlug:input.site});report.costUsd+=call.costUsd;const root=call.result[0];if(!root||!Array.isArray(root.items)&&root.total_count!==0)throw new Error("Ranking data was not returned. Completed target collections remain saved.");items=(root.items??[]) as Record<string,unknown>[];total=num(root.total_count);}
 const keywords=items.flatMap(raw=>{const data=obj(raw.keyword_data),info=obj(data.keyword_info),properties=obj(data.keyword_properties),intent=obj(data.search_intent_info),serp=obj(obj(raw.ranked_serp_element).serp_item);const keyword=typeof data.keyword==="string"?data.keyword:"",url=typeof serp.url==="string"?serp.url:null;if(!keyword||!url||!targetMatches(target,url)||serp.type!==target.kind)return [];return [{keyword,position:num(serp.rank_group),url,volume:num(info.search_volume),difficulty:num(properties.keyword_difficulty),intent:typeof intent.main_intent==="string"?intent.main_intent:null}];});
 const collection:TargetCollection={target,keywords:[...new Map([...(prior?.keywords??[]),...keywords].map(row=>[row.keyword.toLowerCase(),row])).values()],total,offset:offset+items.length,complete:total!=null&&offset+items.length>=total,collectedAt:new Date().toISOString()};report.collections=[...report.collections.filter(row=>row.target.id!==target.id),collection];await saveWorkspace(input.site,"comparisons",key,report as unknown as Record<string,unknown>,"running");}
 const record=await saveWorkspace(input.site,"comparisons",key,report as unknown as Record<string,unknown>,"completed");return NextResponse.json({record});
 }catch(e){const record=await saveWorkspace(input.site,"comparisons",key,report as unknown as Record<string,unknown>,"partial").catch(()=>null);return NextResponse.json({record,error:e instanceof Error?e.message:"Comparison collection failed."},{status:502});}}

const Verify=z.object({site:z.string().min(1),id:z.string().uuid(),updatedAt:z.string(),keywords:z.array(z.string()).min(1).max(50)});
export async function PATCH(request:Request){
 const parsed=Verify.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid verification selection."},{status:400});const input=parsed.data;
 if(!await canAccessSite(request,input.site)||!await hasPermission(request,"research",input.site))return NextResponse.json({error:"Website research access required."},{status:403});
 const current=(await workspaceRecords(input.site,"comparisons")).find(row=>row.id===input.id);if(!current)return NextResponse.json({error:"Comparison not found."},{status:404});if(current.updatedAt!==input.updatedAt)return NextResponse.json({error:"This comparison changed. Reopen it before saving verification."},{status:409});
 const report=current.payload as ComparisonReport,keys=new Set(input.keywords.map(key=>key.toLowerCase()));
 const evidence=(await workspaceRecords(input.site,"serp_evidence")).map(row=>row.payload as unknown as import("@/lib/serp-evidence").SerpEvidence).filter(row=>keys.has(row.keyword.toLowerCase())&&row.locationCode===report.input.locationCode&&row.languageCode===report.input.languageCode&&row.device==="desktop").sort((a,b)=>Date.parse(a.collectedAt)-Date.parse(b.collectedAt));
 const verification=[...new Map([...(report.verification??[]),...evidence].map(row=>[row.keyword.toLowerCase(),row])).values()];
 const record=await updateWorkspace(current,{...current.payload,verification});return record?NextResponse.json({record}):NextResponse.json({error:"This comparison changed. Reopen it and retry."},{status:409});
}
