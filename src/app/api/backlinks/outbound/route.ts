import {NextResponse} from "next/server";
import {canAccessSite} from "@/platform/access";
import {workspaceRecords} from "@/platform/workspace-store";
import {safeEvidenceUrl} from "@/lib/research-evidence";
export const runtime="nodejs";
export async function GET(request:Request){
 const site=new URL(request.url).searchParams.get("site")??"";
 if(!site||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});
 try{
  const records=(await workspaceRecords(site,"outbound_links")).sort((a,b)=>String(b.payload.capturedAt??"").localeCompare(String(a.payload.capturedAt??"")));
  const run=records[0]?.payload.runId;
  const rows=records.filter(row=>row.payload.runId===run).flatMap(row=>{
   const sourceUrl=safeEvidenceUrl(row.payload.sourceUrl);if(!sourceUrl)return [];
   return (Array.isArray(row.payload.links)?row.payload.links:[]).flatMap((value:unknown)=>{
    if(!value||typeof value!=="object")return [];const link=value as Record<string,unknown>,targetUrl=safeEvidenceUrl(link.targetUrl);if(!targetUrl)return [];
    return [{sourceUrl,targetUrl,domain:new URL(targetUrl).hostname,anchor:typeof link.anchor==="string"?link.anchor:null,nofollow:link.nofollow===true,capturedAt:String(row.payload.capturedAt??"")}];
   });
  });
  return NextResponse.json({rows,pages:records.filter(row=>row.payload.runId===run).length,coverageLimited:records.length===500||records.some(row=>row.payload.runId===run&&row.payload.truncated===true),capturedAt:records[0]?.payload.capturedAt??null,runId:run??null});
 }catch{return NextResponse.json({error:"Outbound link evidence is unavailable."},{status:503});}
}
