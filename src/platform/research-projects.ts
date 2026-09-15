import {eq} from "drizzle-orm";
import {hasDatabase} from "@/sync/store";
import {db,schema} from "@/db";
export type PreviewProject={id:string;siteSlug:string|null;name:string;description:string|null;status:string;tags:string[];createdBy:string|null;createdAt:string;updatedAt:string};
const preview=globalThis as typeof globalThis & {seoResearchProjects?:PreviewProject[]};
export const previewProjects=process.env.QA_SYNTHETIC==="true"?(preview.seoResearchProjects??=[]):[];
export async function validResearchProject(id:string|undefined|null,site:string|null){
 if(!id)return true;
 if(process.env.QA_SYNTHETIC!=="true"&&!hasDatabase())return false;
 const project=process.env.QA_SYNTHETIC==="true"?previewProjects.find(row=>row.id===id):(await db().select().from(schema.keywordProjects).where(eq(schema.keywordProjects.id,id)).limit(1))[0];
 return !!project&&project.siteSlug===site&&project.status==="active";
}
