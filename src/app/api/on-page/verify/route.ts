import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessSite, hasPermission } from "@/platform/access";
import { workspaceRecords, updateWorkspace } from "@/platform/workspace-store";
import { getManagedSite } from "@/platform/site-store";
import { readPageBenchmark } from "@/platform/page-benchmark";
import { onPageIdeas, type OnPageReport } from "@/lib/on-page-analysis";
export const runtime = "nodejs";
const Input=z.object({site:z.string(),id:z.string().uuid(),updatedAt:z.string().datetime()});
export async function POST(request:Request){
 const parsed=Input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Choose a saved analysis."},{status:400});
 const {site,id,updatedAt}=parsed.data;
 const managed=await getManagedSite(site);
 if(!managed||!await canAccessSite(request,site)||!await hasPermission(request,"manage_content",site))return NextResponse.json({error:"Content permission required."},{status:403});
 const row=(await workspaceRecords(site,"onpage")).find(item=>item.recordKey===id),report=row?.payload.report as OnPageReport|undefined;
 if(!row||!report?.own)return NextResponse.json({error:"A readable original page analysis is required."},{status:404});
 if(row.updatedAt!==updatedAt)return NextResponse.json({error:"This analysis changed. Reload before checking it."},{status:409});
 if(new URL(report.url).hostname.replace(/^www\./,"")!==managed.host.replace(/^www\./,""))return NextResponse.json({error:"The page no longer belongs to this website."},{status:409});
 try{
  const own=await readPageBenchmark(report.url);
  const current=onPageIdeas(own,report.benchmarks,report.keyword,report.serp,report.features);
  const eligible=report.ideas.filter(idea=>!["backlinks","strategy","serp"].includes(idea.category)&&idea.id!=="review-engagement");
  const resolved=eligible.filter(idea=>!current.some(item=>item.id===idea.id)).map(idea=>idea.id);
  const remaining=eligible.filter(idea=>current.some(item=>item.id===idea.id)).map(idea=>idea.id);
  const decisions={...report.decisions};
  for(const id of resolved)if(decisions[id]!=="dismissed")decisions[id]="done";
  for(const id of remaining)if(decisions[id]==="done")decisions[id]="open";
  const record=await updateWorkspace(row,{...row.payload,report:{...report,decisions,verification:{checkedAt:new Date().toISOString(),resolved,remaining}},verificationPage:own});
  if(!record)return NextResponse.json({error:"This analysis changed while checking. Reload before retrying."},{status:409});
  return NextResponse.json({record});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"The page could not be verified. Its previous evidence was preserved."},{status:502});}
}
