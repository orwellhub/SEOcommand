import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { commandRecords, saveCommandRecord } from "./command-store";
import { hasDatabase } from "@/sync/store";
import type { CommandRecord } from "@/lib/command-model";
export type WorkspaceKind="onpage"|"keyword_gap"|"backlink_decisions"|"topic_favorites"|"listing_inventory"|"writing_suggestions"|"organic_competitors"|"advertising"|"serp_evidence"|"comparisons"|"keyword_filters"|"serp_strategy"|"ad_history";
export async function workspaceRecords(site:string,kind:WorkspaceKind):Promise<CommandRecord[]>{
 const name=`workspace_${kind}`;
 if(process.env.QA_SYNTHETIC==="true")return (await commandRecords(site)).filter(row=>row.kind===name);
 if(!hasDatabase())return [];
 const query=db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug,site),eq(schema.commandRecords.kind,name))).orderBy(desc(schema.commandRecords.updatedAt));
 const rows=await (["backlink_decisions","topic_favorites","listing_inventory"].includes(kind)?query:query.limit(500));
 return rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),nextRunAt:row.nextRunAt?.toISOString()??null}));
}
export function saveWorkspace(site:string,kind:WorkspaceKind,key:string,payload:Record<string,unknown>,status="saved"){return saveCommandRecord(site,`workspace_${kind}`,key,payload,{status});}

/** Save a review selection atomically, retaining payload fields the caller did not edit. */
export async function mergeWorkspaceBatch(site:string,kind:WorkspaceKind,entries:{key:string;payload:Record<string,unknown>}[]){
 const rows=[...new Map(entries.map(row=>[row.key,row])).values()];if(!rows.length)return;
 if(process.env.QA_SYNTHETIC==="true"){const existing=await workspaceRecords(site,kind);for(const row of rows)await saveWorkspace(site,kind,row.key,{...existing.find(item=>item.recordKey===row.key)?.payload,...row.payload});return;}
 const now=new Date();
 await db().insert(schema.commandRecords).values(rows.map(row=>({siteSlug:site,kind:`workspace_${kind}`,recordKey:row.key,payload:row.payload,updatedAt:now}))).onConflictDoUpdate({target:[schema.commandRecords.siteSlug,schema.commandRecords.kind,schema.commandRecords.recordKey],set:{payload:sql`${schema.commandRecords.payload} || excluded.payload`,updatedAt:now}});
}

/** Compare-and-swap protects durable review changes from stale browser sessions. */
export async function updateWorkspace(current:CommandRecord,payload:Record<string,unknown>,status=current.status){
 const now=new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1));
 if(process.env.QA_SYNTHETIC==="true"){
  const latest=(await commandRecords(current.siteSlug)).find(row=>row.id===current.id);
  if(latest?.updatedAt!==current.updatedAt)return null;
  return saveCommandRecord(current.siteSlug,current.kind,current.recordKey,payload,{status});
 }
 const [row]=await db().update(schema.commandRecords).set({payload,status,updatedAt:now}).where(and(eq(schema.commandRecords.id,current.id),eq(schema.commandRecords.siteSlug,current.siteSlug),sql`date_trunc('milliseconds', ${schema.commandRecords.updatedAt}) = ${new Date(current.updatedAt)}`)).returning();
 return row?{...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),nextRunAt:row.nextRunAt?.toISOString()??null}:null;
}
