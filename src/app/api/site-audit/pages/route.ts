import {NextResponse} from "next/server";
import {canAccessSite} from "@/platform/access";
import {auditPageRun,auditPageRuns} from "@/platform/audit-page-store";
export async function GET(request:Request){const params=new URL(request.url).searchParams,site=params.get("site")??"";if(!site||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});const id=params.get("run");if(!id)return NextResponse.json({runs:(await auditPageRuns(site)).map(({id,date,source,total})=>({id,date,source,total}))});const run=await auditPageRun(site,id);return run?NextResponse.json({run}):NextResponse.json({error:"Crawl not found in this website."},{status:404});}
