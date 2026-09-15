import type {CrawlRun,TechnicalIssue} from "./types";
export type AuditSnapshot={date:string;collectedAt:string;healthScore:number|null;methodologyVersion:number;issues:TechnicalIssue[];crawlRun:CrawlRun|null};
export function compareAudits(before:AuditSnapshot,after:AuditSnapshot){
 const keys=[...new Set([...before.issues,...after.issues].map(row=>`${row.category}:${row.title}`))];
 const comparable=before.methodologyVersion===after.methodologyVersion&&before.crawlRun?.pagesCrawled!=null&&before.crawlRun.pagesCrawled===after.crawlRun?.pagesCrawled;
 return keys.map(key=>{const old=before.issues.find(row=>`${row.category}:${row.title}`===key),next=after.issues.find(row=>`${row.category}:${row.title}`===key);return {key,title:(next??old)!.title,severity:(next??old)!.severity,before:old?.affectedPages??0,after:next?.affectedPages??0,change:comparable?(next?.affectedPages??0)-(old?.affectedPages??0):null,comparable};});
}
