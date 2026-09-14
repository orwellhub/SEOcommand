"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useJson } from "@/lib/use-live";
import type { TrafficEvidence } from "@/lib/traffic-research";
import type { prepareTrafficConnection } from "@/providers/similarweb/connection";
import { useDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/primitives";
import { ReportMetric, ReportTabs, UnavailableReport, useReportView } from "@/components/reports/report-layout";
import { navigationHref } from "@/lib/nav";

type ConnectionPayload = {connection:ReturnType<typeof prepareTrafficConnection>;evidence:TrafficEvidence|null};
const channels = ["Organic search", "Paid search", "Direct", "Social", "Referral", "Email", "Display ads"];
export default function TrafficAnalyticsPage() {
  const { activeDomain, scope, range } = useDomain();
  const [target,setTarget]=useState("");
  useEffect(()=>setTarget(""),[activeDomain?.id]);
  const traffic=useJson<ConnectionPayload>(activeDomain ? `/api/traffic-analytics?site=${activeDomain.id}${target?`&domain=${encodeURIComponent(target)}`:""}` : "/api/traffic-analytics?site=");
  const [view, setView] = useReportView(["overview", "channels", "countries", "pages"] as const, "overview");
  return <div id="analytics-report" className="space-y-4"><PageHeader title={`Traffic Analytics: ${activeDomain?.host ?? "Selected website"}`} description="Estimated competitor visits and acquisition channels. Review saved traffic evidence and prepare a provider connection." />
    <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><label className="text-sm">Research domain <input key={activeDomain?.id} aria-label="Traffic research domain" defaultValue={activeDomain?.host ?? ""} placeholder="competitor.com" className="ml-2 h-9 rounded border border-border bg-card px-3" onBlur={e=>setTarget(e.target.value)}/></label><span className="text-xs text-muted">{traffic.data?.connection.configured ? "API key present · subscription approval needed" : "Similarweb API subscription and key needed"}</span></div><p className="mt-3 text-xs text-muted">Opening this report makes no paid provider request. {traffic.data?.connection.credits ?? 15} estimated credits for one month of total visits and desktop + mobile channels; subscription price must be confirmed first.</p>{traffic.error&&<button className="mt-2 text-xs text-critical" onClick={traffic.refresh}>Connection details could not load. Retry</button>}<details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-purple">Review connection requirements</summary><ul className="mt-2 list-disc space-y-2 pl-4">{traffic.data?.connection.requirements.map(r=><li key={r}>{r}</li>)}</ul><p className="mt-2 text-muted">Country distribution and total-traffic top pages need additional entitlements and pricing. They remain unavailable until approved.</p></details></Card>
    <ReportTabs items={[{id:"overview",label:"Overview"},{id:"channels",label:"Traffic channels"},{id:"countries",label:"Geographical distribution"},{id:"pages",label:"Top pages"}]} value={view} onChange={setView} />
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="rounded border border-border bg-card px-3 py-2">Worldwide · unavailable</span><span className="rounded border border-border bg-card px-3 py-2">All devices · unavailable</span><span>No collection date</span><Link href={navigationHref({href:"/domain-research",group:"site"},scope,range)} className="ml-auto text-purple">Open saved organic research →</Link></div>
    {view === "overview" && traffic.data?.evidence && <Card><div className="grid grid-cols-3"><ReportMetric label="Visits" value={traffic.data.evidence.visits}/><ReportMetric label="Month" value={traffic.data.evidence.input.month}/><ReportMetric label="Collected" value={new Date(traffic.data.evidence.collectedAt).toLocaleDateString()}/></div></Card>}
    {view === "overview" && !traffic.data?.evidence && <UnavailableReport title="Traffic overview" description="Estimated total visits require a traffic data source. Organic search estimates are available separately in Domain Overview." metrics={["Visits", "Unique visitors", "Pages / visit", "Bounce rate"]} />}
    {(view === "overview" || view === "channels") && <Card><CardHeader title="Traffic channels" subtitle="Estimated visits and share of total traffic" /><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-workspace text-xs text-muted"><tr><th className="px-4 py-3">Channel</th><th>Visits</th><th>Traffic share</th><th>Change</th></tr></thead><tbody>{channels.map((channel) => { const alias:Record<string,string>={"Organic search":"Organic Search","Paid search":"Paid Search","Referral":"Referrals","Email":"Mail","Display ads":"Display Ads"}; const row=traffic.data?.evidence?.channels.find(r=>r.name===(alias[channel]??channel)); return <tr key={channel} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{channel}</td><td>{row?.visits?.toLocaleString()??"—"}</td><td>{row?.share==null?"—":`${row.share.toFixed(1)}%`}</td><td className="text-xs text-muted">Unavailable</td></tr>;})}</tbody></table></div></Card>}
    {view === "countries" && <UnavailableReport title="Geographical distribution" description="Competitor traffic by country is unavailable until a traffic data source is connected." metrics={["Countries", "Visits", "Traffic share", "Change"]} />}
    {view === "pages" && <UnavailableReport title="Top pages by total traffic" description="Competitor page-level total traffic has not been collected. Saved organic page estimates remain in Domain Overview." metrics={["Pages", "Visits", "Entrances", "Exits"]} />}
  </div>;
}
