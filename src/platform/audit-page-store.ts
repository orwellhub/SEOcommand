import {and,desc,eq} from "drizzle-orm";
import {db,schema} from "@/db";
import {hasDatabase} from "@/sync/store";
import {ON_PAGE_ISSUE_CHECKS} from "@/providers/dataforseo/normalizers";
import {qaBrowserCrawl} from "@/data/qa-fixtures";
import type {AuditPage,AuditPageRun} from "@/lib/audit-pages";
type BrowserPage=Pick<typeof schema.browserCrawlPages.$inferSelect,"url"|"statusCode"|"renderedTitle"|"canonical"|"depth"|"loadTimeMs"|"issues"|"internalLinks"|"externalLinks"|"hreflang"|"schemaTypes">;
function baseChecks(page:{url:string;statusCode:number|null;loadTimeMs:number|null}){const checks:Record<string,boolean>={};if(page.statusCode!=null){checks.http_error=page.statusCode>=400;checks.is_http=page.url.startsWith("http:");}if(page.loadTimeMs!=null)checks.high_loading_time=page.loadTimeMs>3000;return checks;}
const BROWSER_PAGE_CHECKS=["missing_title","missing_description","missing_h1","multiple_h1","missing_canonical","not_indexable","invalid_json_ld","javascript_dependent_content","hreflang_missing_self_reference","ai_snippet_blocked","ai_snippet_limited","ai_partial_nosnippet"];
export function browserAuditPage(page:BrowserPage):AuditPage{const recorded=page.issues.includes("browser_render_failed")?{}:Object.fromEntries(BROWSER_PAGE_CHECKS.map(key=>[key,page.issues.includes(key)]));return {url:page.url,statusCode:page.statusCode,title:page.renderedTitle,canonical:page.canonical,depth:page.depth,loadTimeMs:page.loadTimeMs,checks:{...baseChecks(page),...recorded,...Object.fromEntries(page.issues.map(issue=>[issue,true]))},internalLinks:page.internalLinks,externalLinks:page.externalLinks,hreflang:page.hreflang,schemaTypes:page.schemaTypes,source:"browser"};}
export async function auditPageRuns(site:string){
 if(process.env.QA_SYNTHETIC==="true"){const fixture=qaBrowserCrawl(site),pages=fixture.pages.map(browserAuditPage);for(const page of pages)page.checks.missing_title=!page.title;const before:AuditPageRun={id:"earlier",date:"2026-08-19T07:43:00Z",source:"browser",total:pages.length,pages:pages.map((page,i)=>({...page,checks:{...page.checks,missing_title:i===2,http_error:false}})),truncated:false};return [before,{id:"latest",date:fixture.run.completedAt,source:"browser" as const,total:pages.length,pages,truncated:false}];}
 if(!hasDatabase())return [];
 const [detailed,browser]=await Promise.all([db().select().from(schema.detailedCrawlRuns).where(and(eq(schema.detailedCrawlRuns.siteSlug,site),eq(schema.detailedCrawlRuns.status,"completed"))).orderBy(desc(schema.detailedCrawlRuns.completedAt)).limit(30),db().select().from(schema.browserCrawlRuns).where(and(eq(schema.browserCrawlRuns.siteSlug,site),eq(schema.browserCrawlRuns.status,"completed"))).orderBy(desc(schema.browserCrawlRuns.completedAt)).limit(30)]);
 return [...detailed.map(run=>({id:run.id,date:run.completedAt?.toISOString()??run.startedAt.toISOString(),source:"dataforseo" as const,total:run.pagesCrawled})),...browser.map(run=>({id:run.id,date:run.completedAt?.toISOString()??run.startedAt.toISOString(),source:"browser" as const,total:run.pagesCrawled}))].sort((a,b)=>a.date.localeCompare(b.date));
}
export async function auditPageRun(site:string,id:string):Promise<AuditPageRun|null>{
 const run=(await auditPageRuns(site)).find(run=>run.id===id);if(!run)return null;
 if("pages" in run)return run as AuditPageRun;
 let pages:AuditPage[];
 if(run.source==="dataforseo")pages=(await db().select().from(schema.detailedCrawlPages).where(and(eq(schema.detailedCrawlPages.siteSlug,site),eq(schema.detailedCrawlPages.runId,id))).orderBy(schema.detailedCrawlPages.url).limit(10001)).map(page=>({url:page.url,statusCode:page.statusCode,title:page.title,canonical:page.canonical,depth:page.depth,loadTimeMs:page.loadTimeMs,checks:{...baseChecks(page),...Object.fromEntries(ON_PAGE_ISSUE_CHECKS.filter(key=>typeof page.checks[key]==="boolean"||typeof page.checks[key]==="number").map(key=>[key,page.checks[key]===true||typeof page.checks[key]==="number"&&Number(page.checks[key])>0]))},internalLinks:page.links.internal??null,externalLinks:page.links.external??null,hreflang:{},schemaTypes:[],source:"dataforseo"}));
 else pages=(await db().select().from(schema.browserCrawlPages).where(and(eq(schema.browserCrawlPages.siteSlug,site),eq(schema.browserCrawlPages.runId,id))).orderBy(schema.browserCrawlPages.url).limit(10001)).map(browserAuditPage);
 return {...run,pages:pages.slice(0,10000),truncated:pages.length>10000||run.total>pages.length};
}
