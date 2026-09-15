import {NextResponse} from "next/server";
import {canAccessSite} from "@/platform/access";
import {getManagedSite} from "@/platform/site-store";
import {hasDatabase,readSnapshotHistory} from "@/sync/store";
import {qaDomainBundle} from "@/data/qa-fixtures";
import type {AuditSnapshot} from "@/lib/audit-reports";
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!await getManagedSite(site)||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});
 const snapshots=process.env.QA_SYNTHETIC==="true"?[{dataset:"onpage",capturedOn:"2026-08-26",payload:qaDomainBundle(site).datasets.onpage?.data,provenance:{collectedAt:"2026-08-26T08:00:00Z"}}]:hasDatabase()?await readSnapshotHistory(site,"onpage"):[];
 const distinct=new Map<string,AuditSnapshot>();
 for(const row of snapshots){const payload=row.payload as {healthScore:number|null;methodologyVersion?:number;issues:AuditSnapshot["issues"];crawlRun:AuditSnapshot["crawlRun"]}|null;if(!payload?.crawlRun||payload.crawlRun.status!=="completed")continue;const date=payload.crawlRun.completedAt||row.capturedOn;distinct.set(date,{date,collectedAt:row.provenance.collectedAt,healthScore:payload.healthScore??null,methodologyVersion:payload.methodologyVersion??1,issues:payload.issues??[],crawlRun:payload.crawlRun});}
 return NextResponse.json({reports:[...distinct.values()].sort((a,b)=>a.date.localeCompare(b.date))});}
