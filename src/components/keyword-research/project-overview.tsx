"use client";
import {useJson} from "@/lib/use-live";
import {Card} from "@/components/ui/primitives";
import type {CommandRecord} from "@/lib/command-model";
import type {SerpStrategy} from "@/lib/serp-strategy";
type Topic={id:string;projectId?:string;label:string;targetUrl:string;keywords:string[];sourceEvidence?:{projectId?:string}};
type Work={id:string;title:string;status:string;ownerEmail?:string;sourceEvidence?:{projectId?:string}};
export function ResearchProjectOverview({site,project}:{site:string;project:string}){
 const strategies=useJson<{records:CommandRecord[]}>(`/api/keyword-strategy/serp?site=${site}`),topics=useJson<{plans:Topic[]}>(`/api/topic-plans?site=${site}`),work=useJson<{items:Work[]}>(`/api/workflow/tasks?domain=${site}`);
 const query=new URLSearchParams({site,project});
 const groups=[{title:"Page strategies",create:`/keyword-strategy?${query}&view=clusters`,rows:(strategies.data?.records??[]).filter(row=>(row.payload as unknown as SerpStrategy).input?.projectId===project).map(row=>({id:row.id,title:(row.payload as unknown as SerpStrategy).input.keywords[0]??"Page strategy",detail:`${(row.payload as unknown as SerpStrategy).clusters.length} clusters`,href:`/keyword-strategy?${query}&view=clusters&strategy=${row.id}`})),error:strategies.error},
 {title:"Topic & page plans",create:`/keyword-strategy?${query}&view=plans`,rows:(topics.data?.plans??[]).filter(row=>row.projectId===project||row.sourceEvidence?.projectId===project).map(row=>({id:row.id,title:row.label,detail:row.targetUrl,href:`/keyword-strategy?${query}&view=plans&plan=${row.id}`})),error:topics.error},
 {title:"Content & assigned work",create:`/work?${query}`,rows:(work.data?.items??[]).filter(row=>row.sourceEvidence?.projectId===project).map(row=>({id:row.id,title:row.title,detail:[row.status,row.ownerEmail].filter(Boolean).join(" · "),href:`/work?${query}&item=${row.id}`})),error:work.error}];
 return <div className="grid gap-3 lg:grid-cols-3">{groups.map(group=><Card key={group.title} className="min-w-0 p-4"><h2 className="text-sm font-semibold">{group.title}</h2><a href={group.create} className="mt-2 inline-block text-xs text-purple">Open workspace →</a>{group.error?<p role="alert" className="mt-3 text-xs text-critical">Could not load this project’s {group.title.toLowerCase()}.</p>:group.rows.length?<ul className="mt-3 divide-y divide-border">{group.rows.map(row=><li key={row.id} className="py-2"><a href={row.href} className="text-sm text-purple">{row.title}</a><p className="mt-1 break-all text-xs text-muted">{row.detail}</p></li>)}</ul>:<p className="mt-3 text-xs text-muted">No linked {group.title.toLowerCase()} yet. Research handoffs retain this project as you create them.</p>}</Card>)}</div>;
}
