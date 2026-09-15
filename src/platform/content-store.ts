import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { contentStage } from "@/lib/content-workspace";
type Row=typeof schema.workflowItems.$inferSelect;
const previewGlobal=globalThis as typeof globalThis & {__seoQaContent?:Map<string,Row>};
const qa=process.env.QA_SYNTHETIC==="true"&&process.env.NODE_ENV==="development"?(previewGlobal.__seoQaContent??=new Map<string,Row>()):new Map<string,Row>();
function requireStore(){if(!hasDatabase()&&process.env.QA_SYNTHETIC!=="true")throw new Error("Content workflow requires the workspace database.");}
export function serializeContent(item:Row){const data=item.executionData??{};return {...item,contentStage:contentStage(data),brief:data.brief??{},draftUrl:data.draftUrl??null,publishedUrl:data.publishedUrl??null};}
export async function listContent(site:string){requireStore();if(process.env.QA_SYNTHETIC==="true")return [...qa.values()].filter(r=>r.domainSlug===site);return db().select().from(schema.workflowItems).where(and(eq(schema.workflowItems.domainSlug,site),eq(schema.workflowItems.decision,"approved"),inArray(schema.workflowItems.executionType,["content_brief","refresh_brief"]))).orderBy(desc(schema.workflowItems.priorityScore),desc(schema.workflowItems.updatedAt));}
export async function getContent(id:string){requireStore();if(process.env.QA_SYNTHETIC==="true")return qa.get(id);const [row]=await db().select().from(schema.workflowItems).where(eq(schema.workflowItems.id,id)).limit(1);return row;}
export async function createContent(values:typeof schema.workflowItems.$inferInsert){requireStore();if(process.env.QA_SYNTHETIC==="true"){const row={id:crypto.randomUUID(),createdAt:new Date(),updatedAt:new Date(),status:null,sourceUrl:null,sourceEvidence:{},opportunityId:null,executionType:null,ownerEmail:null,dueDate:null,pageMode:null,targetUrl:null,plannedUrl:null,executionData:{},verification:{},shippedAt:null,verifiedAt:null,createdBy:null,...values} as Row;qa.set(row.id,row);return row;}const [row]=await db().insert(schema.workflowItems).values(values).returning();return row!;}
/** Compare-and-swap the task; merge only the fields the caller owns. */
export async function patchContent(current:Row,fields:Partial<Pick<Row,"title"|"ownerEmail"|"dueDate"|"targetUrl"|"plannedUrl"|"status"|"shippedAt">>,data:Record<string,unknown>={}){
  const now=new Date(Math.max(Date.now(),current.updatedAt.getTime()+1));
  if(process.env.QA_SYNTHETIC==="true"){const saved=qa.get(current.id);if(!saved||saved.updatedAt.getTime()!==current.updatedAt.getTime())return undefined;const next={...saved,...fields,executionData:{...saved.executionData,...data},updatedAt:now};qa.set(next.id,next);return next;}
  const [row]=await db().update(schema.workflowItems).set({...fields,executionData:sql`${schema.workflowItems.executionData} || ${JSON.stringify(data)}::jsonb`,updatedAt:now}).where(and(eq(schema.workflowItems.id,current.id),eq(schema.workflowItems.updatedAt,current.updatedAt))).returning();return row;
}
