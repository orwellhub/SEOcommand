import { z } from "zod";
export const CONTENT_STAGES = ["brief", "draft", "review", "published"] as const;
export type ContentStage = typeof CONTENT_STAGES[number];
export const BriefSchema = z.object({
  primaryKeyword:z.string().trim().max(160).default(""), secondaryKeywords:z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  searchIntent:z.enum(["informational","commercial","transactional","navigational","mixed"]).default("mixed"), titleRecommendation:z.string().trim().max(300).default(""), metaRecommendation:z.string().trim().max(500).default(""),
  headingPlan:z.array(z.string().trim().min(1).max(300)).max(30).default([]), coverageNotes:z.array(z.string().trim().min(1).max(500)).max(50).default([]), internalLinks:z.array(z.string().trim().min(1).max(1000)).max(50).default([]), schemaRecommendations:z.array(z.string().trim().min(1).max(300)).max(20).default([]),
});
export type ContentBrief = z.infer<typeof BriefSchema>;
export const emptyBrief:ContentBrief=BriefSchema.parse({});
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;}
export const DueDateSchema=z.string().refine(validDate,"Choose a valid calendar date.").nullable();
export const PublicUrlSchema=z.string().trim().url().max(2000).refine(value=>{const url=new URL(value);return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password;},"Use an HTTP or HTTPS URL.");
export function contentStage(data:Record<string,unknown>):ContentStage{return CONTENT_STAGES.includes(data.contentStage as ContentStage)?data.contentStage as ContentStage:"brief";}
export function stageError(data:Record<string,unknown>,stage:ContentStage,draftUrl?:string|null,publishedUrl?:string|null){
  if(CONTENT_STAGES.indexOf(stage)!==CONTENT_STAGES.indexOf(contentStage(data))+1)return "Move content through each editorial stage in order.";
  if(stage==="review"&&!draftUrl&&!data.draftUrl&&!(data.editor as {text?:string}|undefined)?.text?.trim())return "Save an internal draft or add a draft URL before review.";
  if(stage==="published"&&!publishedUrl&&!data.publishedUrl)return "Add the live published URL.";
  return null;
}
export function monthDays(month:string){const first=new Date(`${month}-01T12:00:00Z`);if(!Number.isFinite(first.getTime()))return [];first.setUTCDate(1-((first.getUTCDay()+6)%7));return Array.from({length:42},(_,i)=>{const day=new Date(first);day.setUTCDate(first.getUTCDate()+i);return day.toISOString().slice(0,10);});}

export function weekDays(day:string){if(!validDate(day))return [];const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>{const value=new Date(date);value.setUTCDate(date.getUTCDate()+i);return value.toISOString().slice(0,10);});}
