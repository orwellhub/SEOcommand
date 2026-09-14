import { NextResponse } from "next/server";
import { canAccessSite, hasPermission } from "@/platform/access";
import { commandRecords } from "@/platform/command-store";
import { getManagedSite } from "@/platform/site-store";
import { trafficInputSchema, type TrafficEvidence } from "@/lib/traffic-research";
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
 const saved=records.filter(r=>r.kind==="traffic_evidence"&&r.status==="completed").map(r=>r.payload as unknown as TrafficEvidence).filter(r=>r.provider==="similarweb"&&r.input.domain===input.domain&&r.input.month===input.month&&r.input.country===input.country);
 return NextResponse.json({connection:prepareTrafficConnection(input),evidence:saved[0]??null,canManage:await hasPermission(request,"run_scans",site)});
 }catch{return NextResponse.json({error:"Saved traffic evidence could not load."},{status:503});}
}
