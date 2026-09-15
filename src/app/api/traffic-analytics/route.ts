import { NextResponse } from "next/server";
import { canAccessSite, hasPermission } from "@/platform/access";
import { commandRecords } from "@/platform/command-store";
import { getManagedSite } from "@/platform/site-store";
import { trafficInputSchema, type TrafficEvidence,type TrafficDetail } from "@/lib/traffic-research";
import { collectTraffic } from "@/providers/similarweb/collect";
import { z } from "zod";
import { prepareTrafficConnection } from "@/providers/similarweb/connection";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,site=params.get("site")??"";
 if(!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});
 const managed=await getManagedSite(site);if(!managed)return NextResponse.json({error:"Website not found."},{status:404});
 const previous=new Date();previous.setUTCDate(1);previous.setUTCMonth(previous.getUTCMonth()-1);
 const parsed=trafficInputSchema.safeParse({domain:params.get("domain")||managed.host,month:params.get("month")||previous.toISOString().slice(0,7),country:params.get("country")||"world"});
 if(!parsed.success)return NextResponse.json({error:"Choose a domain, calendar month and country."},{status:400});
 try{const records=await commandRecords(site),input=parsed.data;
 const all=records.filter(r=>r.kind==="traffic_evidence"&&r.status==="completed").map(r=>r.payload as unknown as TrafficEvidence).filter(r=>r.provider==="similarweb"&&r.input.domain===input.domain);
 const details=records.filter(r=>r.kind==="traffic_detail"&&r.status==="completed").map(r=>r.payload as unknown as TrafficDetail).filter(r=>r.input.domain===input.domain&&r.input.month===input.month);
 const saved=all.filter(r=>r.input.country===input.country);
 return NextResponse.json({detailConnections:{pages:prepareTrafficConnection(input,"pages"),countries:prepareTrafficConnection({...input,country:"world"},"countries")},pageReport:details.find(r=>r.report==="pages"&&r.input.country===input.country)??null,countryReport:details.find(r=>r.report==="countries"&&r.input.country==="world")??null,connection:prepareTrafficConnection(input),evidence:saved.find(row=>row.input.month===input.month)??null,countries:all.filter(r=>r.input.month===input.month&&r.input.country!=="world"),history:saved.sort((a,b)=>a.input.month.localeCompare(b.input.month)),canManage:await hasPermission(request,"run_scans",site)});
 }catch{return NextResponse.json({error:"Saved traffic evidence could not load."},{status:503});}
}

const Collection=trafficInputSchema.extend({site:z.string().min(1),report:z.enum(["overview","pages","countries"]).default("overview")});
export async function POST(request:Request){const parsed=Collection.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a valid domain, month and country."},{status:400});const {site,report,...input}=parsed.data;if(!await getManagedSite(site)||!await canAccessSite(request,site)||!await hasPermission(request,"run_scans",site))return NextResponse.json({error:"Scan permission required."},{status:403});if(report==="countries")input.country="world";if(input.month>=new Date().toISOString().slice(0,7))return NextResponse.json({error:"Choose a completed calendar month."},{status:400});if(!prepareTrafficConnection(input,report).collectionEnabled)return NextResponse.json({error:"The traffic-provider subscription has not been approved and configured."},{status:409});try{return NextResponse.json({evidence:await collectTraffic(site,input,report)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Traffic collection failed."},{status:502});}}
