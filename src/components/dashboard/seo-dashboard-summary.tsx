"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { ReportMetric } from "@/components/reports/report-layout";
import { useJson } from "@/lib/use-live";
import type { DomainLiveBundle } from "@/lib/live";
import type { AiVisibilityDashboard } from "@/platform/ai-read-model";
import { searchPeriod, analyticsPeriod } from "@/lib/reporting";
import { compactNumber } from "@/lib/format";
import { navigationHref } from "@/lib/nav";

type LocalSummary = { locations: { id: string; name: string; address: string | null }[]; snapshots: { locationId: string; capturedOn: string; rating: number | null; reviewCount: number | null }[] };
const num = (value: number | null | undefined) => value == null ? null : compactNumber(value);
function Heading({ title, href, note }: { title: string; href: string; note?: string }) {
  return <div className="border-b border-border px-4 py-3"><Link href={href} className="flex items-center justify-between gap-2 text-[15px] font-bold hover:text-purple">{title}<ArrowUpRight className="h-4 w-4 text-muted" /></Link>{note && <p className="mt-1 text-[11px] leading-4 text-muted">{note}</p>}</div>;
}
export function SeoDashboardSummary({ site, bundle, days }: { site: string; bundle: DomainLiveBundle | null; days: number }) {
  const ai = useJson<AiVisibilityDashboard>(`/api/ai-visibility?scope=${encodeURIComponent(site)}&days=90`);
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
  return <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden border-t-2 border-t-purple"><Heading title="AI Search" href={link("/ai-visibility")} note="Measured AI answers · last 90 days" /><div className="grid grid-cols-3 divide-x divide-border"><ReportMetric label="Mention rate" value={measured ? `${ai.data!.summary.mentionRate}%` : null} /><ReportMetric label="Citation rate" value={measured ? `${ai.data!.summary.citationRate}%` : null} /><ReportMetric label="Response checks" value={measured ? num(ai.data!.summary.checks) : null} /></div><div className="border-t border-border px-4 py-2">{["chatgpt", "google_ai_overview", "google_ai_mode", "gemini"].map((name) => { const row = ai.data?.platforms.find((entry) => entry.platform === name); return <div key={name} className="flex items-center justify-between py-1 text-xs"><span className="text-muted">{{chatgpt:"ChatGPT",google_ai_overview:"Google AI Overview",google_ai_mode:"Google AI Mode",gemini:"Gemini"}[name]}</span><span className="font-medium tnum">{row ? `${row.mentionRate}% mentioned` : "Unavailable"}</span></div>; })}{ai.error && <p role="alert" className="text-xs text-critical">AI summary could not load. <button className="underline" onClick={ai.refresh}>Retry</button></p>}</div></Card>
      <Card className="overflow-hidden border-t-2 border-t-purple"><Heading title="SEO" href={link("/research")} note={`${search.start ?? "—"} – ${search.end ?? "—"} · ${search.availableDays}/${days} search days`} /><div className="grid grid-cols-3 divide-x divide-border"><ReportMetric label="Organic clicks" value={num(search.total?.clicks)} note="Search Console" href={link("/research")} /><ReportMetric label="Search impressions" value={num(search.total?.impressions)} note="Search Console" /><ReportMetric label="Average position" value={search.total?.position?.toFixed(1)} note="Search Console" /></div><div className="grid grid-cols-3 divide-x divide-border border-t"><ReportMetric label="Organic key events" value={num(analytics.total?.conversions)} note={`Analytics · ${analytics.availableDays}/${days} days`} href={link("/performance?view=business")} /><ReportMetric label="Discovered keywords" value={d?.keywords ? num(d.keywords.data.length) : null} note={source(d?.keywords?.capturedOn)} href={link("/keyword-strategy")} /><ReportMetric label="Backlinks in sample" value={d?.backlinks ? num(d.backlinks.data.length) : null} note="Saved sample, not total links" href={link("/backlinks")} /></div></Card>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><Heading title="Position Tracking" href={link("/rankings")} /><ReportMetric label="Average tracked position" value={positions?.length ? (positions.reduce((sum, row) => sum + row.position!, 0) / positions.length).toFixed(1) : null} note={source(d?.rank_snapshots?.capturedOn)} /><div className="flex justify-between border-t border-border px-4 py-3 text-xs"><span className="text-muted">Ranked keywords</span><span>{ranks ? positions?.length : "—"}</span></div></Card>
      <Card><Heading title="Site Audit" href={link("/site-audit")} /><ReportMetric label="Site health" value={audit ? `${audit.healthScore}%` : null} note={source(d?.onpage?.capturedOn)} /><div className="flex justify-between border-t border-border px-4 py-3 text-xs"><span className="text-muted">Critical issues</span><span>{audit?.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved").length ?? "—"}</span></div></Card>
      <Card className="sm:col-span-2"><Heading title="Listing Management" href={link("/local-seo")} note="Saved Google Business Profile evidence" /><div className="grid grid-cols-2 divide-x divide-border"><ReportMetric label="Business locations" value={local.data ? local.data.locations.length : null} /><ReportMetric label="Reviews in saved profiles" value={latestProfiles.some((row) => row.reviewCount != null) ? num(latestProfiles.reduce((sum, row) => sum + (row.reviewCount ?? 0), 0)) : null} note={`${latestProfiles.length} profiles with saved evidence`} /></div><div className="border-t border-border px-4 py-3 text-xs text-muted">{local.error ? <span role="alert">Local summary could not load. <button onClick={local.refresh} className="underline">Retry</button></span> : local.data?.locations.length ? local.data.locations.slice(0, 2).map((row) => row.name).join(" · ") : <Link href={link("/local-seo")}>{local.loading ? "Loading saved locations…" : "Add a location to start local monitoring →"}</Link>}</div></Card>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      {title:"On Page SEO",href:"/health?view=issues",label:"Open issues",value:audit ? audit.issues.filter((row) => row.status !== "resolved").length : null,note:"Grouped by underlying cause"},
      {title:"Backlink Audit",href:"/backlinks?view=risk",label:"High-spam links",value:d?.backlinks ? d.backlinks.data.filter((row) => row.toxicity > 50).length : null,note:"Within the saved link sample"},
      {title:"Organic Traffic Insights",href:"/research",label:"Organic sessions",value:num(analytics.total?.sessions),note:"Google Analytics · saved period"},
      {title:"Link Building",href:"/link-building",label:"Referring domains",value:d?.referring_domains ? num(d.referring_domains.data.length) : null,note:"Within the saved domain sample"},
    ].map((item) => <Card key={item.title}><Heading title={item.title} href={link(item.href)} /><ReportMetric label={item.label} value={item.value} note={item.note} /></Card>)}</div>
  </div>;
}
