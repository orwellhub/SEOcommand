"use client";
import Link from "next/link";
import { useDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/primitives";
import { ReportTabs, UnavailableReport, useReportView } from "@/components/reports/report-layout";
import { navigationHref } from "@/lib/nav";

const channels = ["Organic search", "Paid search", "Direct", "Social", "Referral", "Email", "Display ads"];
export default function TrafficAnalyticsPage() {
  const { activeDomain, scope, range } = useDomain();
  const [view, setView] = useReportView(["overview", "channels", "countries", "pages"] as const, "overview");
  return <div className="space-y-4"><PageHeader title={`Traffic Analytics: ${activeDomain?.host ?? "Selected website"}`} description="Estimated competitor visits and acquisition channels. Total-traffic collection has not been connected yet." />
    <ReportTabs items={[{id:"overview",label:"Overview"},{id:"channels",label:"Traffic channels"},{id:"countries",label:"Geographical distribution"},{id:"pages",label:"Top pages"}]} value={view} onChange={setView} />
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="rounded border border-border bg-card px-3 py-2">Worldwide · unavailable</span><span className="rounded border border-border bg-card px-3 py-2">All devices · unavailable</span><span>No collection date</span><Link href={navigationHref({href:"/domain-research",group:"site"},scope,range)} className="ml-auto text-purple">Open saved organic research →</Link></div>
    {view === "overview" && <UnavailableReport title="Traffic overview" description="Estimated total visits require a traffic data source. Organic search estimates are available separately in Domain Overview." metrics={["Visits", "Unique visitors", "Pages / visit", "Bounce rate"]} />}
    {(view === "overview" || view === "channels") && <Card><CardHeader title="Traffic channels" subtitle="Estimated visits and share of total traffic" /><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-workspace text-xs text-muted"><tr><th className="px-4 py-3">Channel</th><th>Visits</th><th>Traffic share</th><th>Change</th></tr></thead><tbody>{channels.map((channel) => <tr key={channel} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{channel}</td><td aria-label="Visits unavailable">—</td><td aria-label="Traffic share unavailable">—</td><td className="text-xs text-muted">Unavailable</td></tr>)}</tbody></table></div></Card>}
    {view === "countries" && <UnavailableReport title="Geographical distribution" description="Competitor traffic by country is unavailable until a traffic data source is connected." metrics={["Countries", "Visits", "Traffic share", "Change"]} />}
    {view === "pages" && <UnavailableReport title="Top pages by total traffic" description="Competitor page-level total traffic has not been collected. Saved organic page estimates remain in Domain Overview." metrics={["Pages", "Visits", "Entrances", "Exits"]} />}
  </div>;
}
