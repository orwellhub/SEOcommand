"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { useDomain } from "@/components/shell/domain-context";
import { MultiLine } from "@/components/charts/charts";
import { ArrowUpRight, X } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { ReportMetric, MissingChart } from "@/components/reports/report-layout";
import { useJson } from "@/lib/use-live";
import type { DomainLiveBundle } from "@/lib/live";
import type { AiVisibilityDashboard } from "@/platform/ai-read-model";
import { searchPeriod, analyticsPeriod } from "@/lib/reporting";
import { compactNumber } from "@/lib/format";
import { navigationHref } from "@/lib/nav";

type LocalSummary = { locations: { id: string; name: string; address: string | null }[]; snapshots: { locationId: string; capturedOn: string; rating: number | null; reviewCount: number | null }[] };
const num = (value: number | null | undefined) => value == null ? null : compactNumber(value);
const WidgetContext = createContext<{hidden:string[];hide:(title:string)=>void}>({hidden:[],hide:()=>{}});
function Widget({title,href,note,children,className=""}:{title:string;href:string;note?:string;children:React.ReactNode;className?:string}) {
  const widgets=useContext(WidgetContext);
  if(widgets.hidden.includes(title)) return null;
  return <Card className={`min-w-0 overflow-hidden rounded-md shadow-none [&_.report-metric]:py-3 ${className}`}><div className="flex h-[42px] items-center gap-3 border-b border-border px-4"><Link href={href} className="flex-1 text-[15px] font-bold hover:text-purple">{title}</Link><Link aria-label={`Open ${title}`} href={href}><ArrowUpRight className="h-4 w-4 text-muted"/></Link><button aria-label={`Hide ${title}`} onClick={()=>widgets.hide(title)} className="text-muted hover:text-ink"><X className="h-3.5 w-3.5"/></button></div>{note&&<p className="px-4 pt-2 text-[11px] text-muted">{note}</p>}{children}</Card>;
}
export function SeoDashboardSummary({ site, bundle, days }: { site: string; bundle: DomainLiveBundle | null; days: number }) {
  const { activeDomain } = useDomain();
  const [hidden,setHidden]=useState<string[]>([]), [hiddenReady,setHiddenReady]=useState(false);
  const [trafficSource,setTrafficSource]=useState("google");
  useEffect(()=>{try{const value=JSON.parse(localStorage.getItem(`dashboard-widgets:${site}`)??"[]");if(Array.isArray(value))setHidden(value.filter(v=>typeof v==="string"));}catch{}setHiddenReady(true);},[site]);
  useEffect(()=>{if(hiddenReady)localStorage.setItem(`dashboard-widgets:${site}`,JSON.stringify(hidden));},[hidden,hiddenReady,site]);
  const domainResearch=useJson<{evidence:{sourceValue:string;capturedAt:string;summary:{organicTraffic?:number;organicKeywords?:number;paidTraffic?:number;paidKeywords?:number}}[]}>("/api/domain-research");
  const domain=domainResearch.data?.evidence.find(r=>r.sourceValue.replace(/^www\./,"")===activeDomain?.host.replace(/^www\./,""));
  const ai = useJson<AiVisibilityDashboard>(`/api/ai-visibility?scope=${encodeURIComponent(site)}&days=${days}`);
  const local = useJson<LocalSummary>(`/api/local-seo?scope=${encodeURIComponent(site)}`);
  const d = bundle?.datasets;
  const search = searchPeriod(bundle, days), analytics = analyticsPeriod(bundle, days);
  const link = (href: string) => navigationHref({ href, group: "site" }, site, `${days}d`);
  const measured = Boolean(ai.data?.summary.checks);
  const audit = d?.onpage?.data;
  const ranks = d?.rank_snapshots?.data;
  const positions = ranks?.filter((row) => row.position != null && row.position > 0);
  const latestProfiles = [...new Map((local.data?.snapshots ?? []).slice().sort((a, b) => a.capturedOn.localeCompare(b.capturedOn)).map((row) => [row.locationId, row])).values()];
  const source = (date?: string) => date ? `Saved ${date.slice(0, 10)}` : "Awaiting collection";
  return <WidgetContext.Provider value={{hidden,hide:(title)=>setHidden(v=>[...v,title])}}><div className="space-y-[22px]">
    <div className="grid gap-[22px] xl:grid-cols-2">
      <Widget title="AI Search" href={link("/ai-visibility")} className="min-h-[258px]"><div className="grid grid-cols-3 divide-x divide-border"><ReportMetric label="AI mention rate" value={measured ? `${ai.data!.summary.mentionRate}%` : null}/><ReportMetric label="Mentions" value={measured ? num(ai.data!.summary.mentions) : null}/><ReportMetric label="Cited pages" value={measured ? num(ai.data!.summary.citedPages) : null}/></div><div className="px-4 pb-3">{["chatgpt","google_ai_overview","google_ai_mode","gemini"].map(name=>{const row=ai.data?.platforms.find(r=>r.platform===name);return <div key={name} className="grid grid-cols-3 py-1 text-xs"><span className="text-muted">{{chatgpt:"ChatGPT",google_ai_overview:"Google AI Overview",google_ai_mode:"Google AI Mode",gemini:"Gemini"}[name]}</span><span className="px-4">{row?.mentions??"—"}</span><span className="px-4">{row?.citedPages??"—"}</span></div>;})}{ai.error&&<button className="text-xs text-critical" onClick={ai.refresh}>AI data failed to load. Retry</button>}</div></Widget>
      <Widget title="SEO" href={link("/domain-research")} className="min-h-[258px]" note={domain ? `Provider estimates · saved ${domain.capturedAt.slice(0,10)}` : "Provider estimates · awaiting domain research"}><div className="grid grid-cols-3 divide-x divide-border"><ReportMetric label="Authority Score"/><ReportMetric label="Organic traffic" value={num(domain?.summary.organicTraffic)}/><ReportMetric label="Organic keywords" value={num(domain?.summary.organicKeywords)}/></div><div className="grid grid-cols-3 divide-x divide-border"><ReportMetric label="Paid traffic" value={num(domain?.summary.paidTraffic)}/><ReportMetric label="Paid keywords" value={num(domain?.summary.paidKeywords)}/><ReportMetric label="Referring domain sample" value={d?.referring_domains ? num(d.referring_domains.data.length) : null}/></div></Widget>
    </div>
    <div className="grid gap-[22px] sm:grid-cols-2 xl:grid-cols-4">
      <Widget title="Position Tracking" href={link("/rankings")} className="min-h-[226px]"><ReportMetric label="Average tracked position" value={positions?.length ? (positions.reduce((sum, row) => sum + row.position!, 0) / positions.length).toFixed(1) : null} note={source(d?.rank_snapshots?.capturedOn)} /><div className="flex justify-between border-t border-border px-4 py-3 text-xs"><span className="text-muted">Ranked keywords</span><span>{ranks ? positions?.length : "—"}</span></div></Widget>
      <Widget title="Site Audit" href={link("/site-audit")} className="min-h-[226px]"><ReportMetric label="Site health" value={audit ? `${audit.healthScore}%` : null} note={source(d?.onpage?.capturedOn)} /><div className="flex justify-between border-t border-border px-4 py-3 text-xs"><span className="text-muted">Critical issues</span><span>{audit?.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved").length ?? "—"}</span></div></Widget>
      <Widget title="Listing Management" href={link("/local-seo")} note="Saved Google Business Profile evidence" className="sm:col-span-2 min-h-[226px]"><div className="grid grid-cols-2 divide-x divide-border"><ReportMetric label="Business locations" value={local.data ? local.data.locations.length : null} /><ReportMetric label="Reviews in saved profiles" value={latestProfiles.some((row) => row.reviewCount != null) ? num(latestProfiles.reduce((sum, row) => sum + (row.reviewCount ?? 0), 0)) : null} note={`${latestProfiles.length} profiles with saved evidence`} /></div><div className="border-t border-border px-4 py-3 text-xs text-muted">{local.error ? <span role="alert">Local summary could not load. <button onClick={local.refresh} className="underline">Retry</button></span> : local.data?.locations.length ? local.data.locations.slice(0, 2).map((row) => row.name).join(" · ") : <Link href={link("/local-seo")}>{local.loading ? "Loading saved locations…" : "Add a location to start local monitoring →"}</Link>}</div></Widget>
    </div>
    <div className="grid gap-[22px] sm:grid-cols-2 xl:grid-cols-4">{[
      {title:"On Page SEO Checker",href:"/health?view=issues",label:"Open issues",value:audit ? audit.issues.filter((row) => row.status !== "resolved").length : null,note:"Grouped by underlying cause"},
      {title:"Backlink Audit",href:"/backlinks?view=risk",label:"High-spam links",value:d?.backlinks ? d.backlinks.data.filter((row) => row.toxicity > 50).length : null,note:"Within the saved link sample"},
      {title:"Organic Traffic Insights",href:"/research",label:"Organic sessions",value:num(analytics.total?.sessions),note:"Google Analytics · saved period"},
      {title:"Link Building Tool",href:"/link-building",label:"Referring domains",value:d?.referring_domains ? num(d.referring_domains.data.length) : null,note:"Within the saved domain sample"},
    ].map((item) => <Widget key={item.title} title={item.title} href={link(item.href)} className="min-h-[226px]"><ReportMetric label={item.label} value={item.value} note={item.note} /></Widget>)}</div>
    <Widget title="Traffic Analytics" href={link("/traffic-analytics")}><div className="flex gap-2 border-b border-border px-4 py-3 text-xs">{[["google","Google Analytics"],["provider","Competitor traffic"]].map(([id,label])=><button aria-pressed={trafficSource===id} onClick={()=>setTrafficSource(id)} key={id} className={`rounded border border-border px-3 py-1 ${trafficSource===id?"bg-purple/10 text-purple":"text-muted"}`}>{label}</button>)}</div><div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-5"><ReportMetric label="Organic sessions" value={trafficSource==="google"?num(analytics.total?.sessions):null}/><ReportMetric label="Unique visitors"/><ReportMetric label="Views / session" value={trafficSource==="google"?analytics.total?.viewsPerSession?.toFixed(2):null}/><ReportMetric label="Visit duration"/><ReportMetric label="Engagement rate" value={trafficSource==="google"&&analytics.total?`${analytics.total.engagementRate.toFixed(1)}%`:null}/></div>{trafficSource==="google"&&analytics.current.length>1 ? <div className="p-4"><MultiLine data={analytics.current.map(r=>({...r}))} height={190} series={[{key:"sessions",name:"Organic sessions",color:"var(--chart-orange)"}]}/></div>:<MissingChart height="h-44" message={trafficSource==="provider"?"Review the traffic provider connection before collecting total visits and channels.":"Daily Analytics history is not available for this period."}/>}</Widget>
    <Widget title="Organic Rankings" href={link("/research")}><div className="grid grid-cols-3 divide-x divide-border"><ReportMetric label="Clicks" value={num(search.total?.clicks)}/><ReportMetric label="Impressions" value={num(search.total?.impressions)}/><ReportMetric label="Average position" value={search.total?.position?.toFixed(1)}/></div>{search.current.length>1?<div className="p-4"><MultiLine data={search.current.map(r=>({...r}))} height={190} series={[{key:"clicks",name:"Search clicks",color:"var(--chart-orange)"}]}/></div>:<MissingChart height="h-40" message="Saved Search Console history is not available."/>}</Widget>
    <details className="rounded border border-border bg-card p-4 text-sm"><summary className="cursor-pointer font-semibold">Hidden widgets ({hidden.length})</summary><div className="mt-3 flex flex-wrap gap-2">{hidden.map(title=><button key={title} onClick={()=>setHidden(v=>v.filter(t=>t!==title))} className="rounded border border-border px-3 py-2 text-xs text-purple">Restore {title}</button>)}{!hidden.length&&<span className="text-xs text-muted">Use × on a widget to move it here.</span>}</div></details>
  </div></WidgetContext.Provider>;
}
