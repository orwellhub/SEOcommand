import "server-only";
import {and,eq,gte,sql} from "drizzle-orm";
import {db,schema} from "@/db";
import {hasDatabase} from "@/sync/store";
import {combineTrafficChannels,type TrafficInput,type TrafficReport,type TrafficDetail} from "@/lib/traffic-research";
import {prepareTrafficConnection} from "./connection";
import {normalizeChannels,normalizeVisits,normalizePopularPages,normalizeGeography} from "./normalize";
import {saveCommandRecord} from "@/platform/command-store";
/** No credentials or provider URLs enter stored errors or client responses. No automatic retries. */
export async function collectTraffic(site:string,input:TrafficInput,report:TrafficReport="overview"){
 const plan=prepareTrafficConnection(input,report);
 if(!plan.collectionEnabled)throw new Error("An approved Similarweb API contract, credentials and monthly credit limit are required before collection.");
 if(process.env.QA_SYNTHETIC==="true"||!hasDatabase())throw new Error("Traffic collection requires the production workspace database.");
 const key=`${report==="overview"?"":`${report}:`}${input.domain}:${input.month}:${input.country}`,monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
 const record=await db().transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('similarweb-provider-spend'))`);
  const [existing]=await tx.select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug,site),eq(schema.commandRecords.kind,"traffic_collection"),eq(schema.commandRecords.recordKey,key)));
  if(existing)return existing;
  const [usage]=await tx.select({credits:sql<number>`coalesce(sum((${schema.commandRecords.payload}->>'reservedCredits')::numeric),0)::int`}).from(schema.commandRecords).where(and(eq(schema.commandRecords.kind,"traffic_collection"),gte(schema.commandRecords.createdAt,monthStart)));
  if(Number(usage?.credits??0)+plan.credits>Number(process.env.SIMILARWEB_MONTHLY_CREDIT_LIMIT))throw new Error("The approved monthly traffic credit limit has been reached.");
  const [created]=await tx.insert(schema.commandRecords).values({siteSlug:site,kind:"traffic_collection",recordKey:key,status:"reserved",payload:{input,reservedCredits:plan.credits,completed:{},inFlight:null}}).returning();return created;
 });
 if(!record)throw new Error("Could not reserve traffic collection.");
 if(record.status==="completed")return record.payload.evidence;
 if(record.payload.inFlight)throw new Error("A previous request has an uncertain outcome. Review its provider usage before requesting it again; saved results have been retained.");
 if(record.status==="running")throw new Error("This traffic report is already being collected.");
 // Claim before external requests so concurrent clicks cannot collect the same report twice.
 const [claimed]=await db().update(schema.commandRecords).set({status:"running",updatedAt:new Date()}).where(and(eq(schema.commandRecords.id,record.id),eq(schema.commandRecords.status,record.status),eq(schema.commandRecords.updatedAt,record.updatedAt))).returning();
 if(!claimed||record.status==="running")throw new Error("This traffic report is already being collected.");
 const completed={...(record.payload.completed as Record<string,unknown>??{})};let inFlight:string|null=null;
 const checkpoint=()=>({input,reservedCredits:plan.credits,completed,inFlight});
 try{
  for(const task of plan.requests){if(task.id in completed)continue;inFlight=task.id;await saveCommandRecord(site,"traffic_collection",key,checkpoint(),{status:"running"});
   const url=new URL(task.url);url.searchParams.set("api_key",process.env.SIMILARWEB_API_KEY!);
   let response:Response;try{response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(30000),redirect:"error",cache:"no-store"});}catch{throw new Error(`Traffic request ${task.id} did not return. It will not be retried automatically.`);}
   if(!response.ok)throw new Error(`Traffic provider returned HTTP ${response.status} for ${task.id}. Review entitlement and usage before retrying.`);
   const raw=await response.json();completed[task.id]=task.id==="visits"?normalizeVisits(raw,input):task.id==="pages"?normalizePopularPages(raw,input):task.id==="countries"?normalizeGeography(raw,input):normalizeChannels(raw,input,task.id as "desktop"|"mobile");inFlight=null;await saveCommandRecord(site,"traffic_collection",key,checkpoint(),{status:"running"});
  }
  const evidence=report!=="overview"?{input,report,provider:"similarweb",collectedAt:new Date().toISOString(),[report]:completed[report]} as TrafficDetail:combineTrafficChannels(input,completed.visits as number|null,completed.desktop as Record<string,number|null>,completed.mobile as Record<string,number|null>,new Date().toISOString());
  await saveCommandRecord(site,report==="overview"?"traffic_evidence":"traffic_detail",key,evidence as unknown as Record<string,unknown>,{status:"completed"});
  await saveCommandRecord(site,"traffic_collection",key,{...checkpoint(),evidence},{status:"completed"});return evidence;
 }catch(error){const message=error instanceof Error?error.message:"Traffic collection failed.";await saveCommandRecord(site,"traffic_collection",key,{...checkpoint(),error:message},{status:"failed"});throw new Error(message);}
}
