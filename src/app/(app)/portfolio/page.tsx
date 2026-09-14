"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowUpRight, ChevronRight, Download, FileText, Globe2, Layers3, RefreshCw, Search, TrendingUp, type LucideIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDomain } from "@/components/shell/domain-context";
import { Card, Skeleton } from "@/components/ui/primitives";
import { useLivePortfolio, usePriorityTasks, useScopedLive, useJson } from "@/lib/use-live";
import { compactNumber, fullNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SiteCommand, TimelineEntry } from "@/lib/command-model";
import type { DS, GscTimeseriesPoint } from "@/lib/live";
import { analyticsPeriod, searchPeriod } from "@/lib/reporting";
import { percentageChange, searchSummary } from "@/lib/dashboard-data";
import { SeoDashboardSummary } from "@/components/dashboard/seo-dashboard-summary";
import { PageHeader } from "@/components/ui/page-header";
import { PriorityTasks } from "@/components/dashboard/priority-tasks";
import { WebsitePageCoverage } from "@/components/command/page-coverage";
import { DataHealthSummary, NextActions, SiteBriefing, PortfolioDataHealth } from "@/components/command/overview-additions";
import { SiteScanCentre } from "@/components/dashboard/site-scan-centre";
import world from "@/components/dashboard/world-dots.json";
import styles from "@/components/dashboard/dashboard.module.css";

const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const number = (value: number | null | undefined) => value == null ? "—" : compactNumber(value);
const colors = ["var(--chart-orange)", "var(--chart-brown)", "var(--chart-blue)", "var(--chart-lilac)"];

function PanelHeading({ title, subtitle, href, icon: Icon }: { title: string; subtitle?: string; href?: string; icon: LucideIcon }) {
  return <div className={styles.heading}>
    <div className={styles.headingMain}>
      <span className={styles.icon}><Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></span>
      <div className="min-w-0"><h2 className={styles.title}>{title}</h2>{subtitle && <p className={styles.subtitle}>{subtitle}</p>}</div>
    </div>
    {href && <Link href={href} className={styles.report}>View results <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
  </div>;
}
function Missing({ children = "Awaiting first sync" }: { children?: React.ReactNode }) {
  return <div className="flex min-h-16 items-center justify-center px-5 py-4 text-center text-sm leading-relaxed text-muted">{children}</div>;
}
function Source({ ds, label }: { ds?: DS<unknown>; label: string }) {
  return <p className="mt-3 text-xs text-muted">{ds ? `${ds.provenance.mode === "demo" ? "Sample data" : label} · ${ds.includedDomains ?? 1} ${(ds.includedDomains ?? 1) === 1 ? "website" : "websites"} · Captured ${shortDate(ds.capturedOn)}` : `${label} · Awaiting sync`}</p>;
}
function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="text-xs text-muted">No comparison</span>;
  const good = invert ? value < 0 : value > 0;
  return <span className={cn("inline-flex items-center gap-0.5 text-xs", value === 0 ? "text-muted" : good ? "text-success" : "text-critical")}>{value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(value).toFixed(1)}%</span>;
}
function TrendChart({ rows, dataKey, color, compare = false, annotations = [] }: { annotations?: TimelineEntry[]; rows: Record<string, string | number | null>[]; dataKey: string; color: string; compare?: boolean }) {
  const [showChanges, setShowChanges] = useState(true);
  const events = annotations.filter((item) => rows.some((row) => row.date === item.date.slice(0, 10))).slice(0, 10);
  if (!rows.length) return <Missing>No daily history yet. This chart appears after a successful sync.</Missing>;
  return <>{events.length > 0 && <label className="mb-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showChanges} onChange={(event) => setShowChanges(event.target.checked)} />Show recorded changes</label>}<div className="h-44 w-full min-w-0" aria-label={`${dataKey} over time`} role="img"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <LineChart data={rows} margin={{ top: 10, right: 9, bottom: 0, left: -18 }} accessibilityLayer>
      <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 4" vertical={false} />
      <XAxis dataKey="date" tickFormatter={shortDate} axisLine={false} tickLine={false} minTickGap={36} tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} dy={8} />
      <YAxis tickFormatter={compactNumber} axisLine={false} tickLine={false} tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} width={58} />
      <Tooltip labelFormatter={(value) => shortDate(String(value))} contentStyle={{ background: "rgb(var(--card))", border: "1px solid rgb(var(--border))", borderRadius: 6, fontSize: 11, color: "rgb(var(--ink))" }} />
      {showChanges && events.map((item, index) => <ReferenceLine key={item.id} x={item.date.slice(0, 10)} stroke="var(--chart-lilac)" strokeDasharray="3 4" label={{ value: String(index + 1), fontSize: 10, fill: "rgb(var(--ink))" }} />)}
      {compare && <Line name="Previous period" dataKey="previous" stroke="rgb(var(--muted) / .45)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
      <Line name={dataKey} dataKey={dataKey} stroke={color} strokeWidth={2} dot={rows.length === 1} activeDot={{ r: 4 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer></div>{showChanges && events.length > 0 && <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer">Change markers and evidence</summary><p className="mt-2">Timing alone does not prove a cause.</p>{events.map((item, index) => <Link key={item.id} href={item.href} className="mt-2 block text-purple">{index + 1}. {shortDate(item.date)} · {item.title}</Link>)}</details>}</>;
}

function SiteTrendChart(props: { site: string; rows: Record<string, string | number | null>[]; dataKey: string; color: string; compare: boolean }) {
  const data = useJson<SiteCommand>(`/api/command?site=${encodeURIComponent(props.site)}`);
  return <TrendChart {...props} annotations={data.data?.timeline} />;
}

export default function PortfolioPage() {
  const [now] = useState(() => Date.now());
  const { range, scope, sites, activeGroup, setScope } = useDomain();
  const live = useScopedLive();
  const priorityTasks = usePriorityTasks(scope);
  const [sitePage, setSitePage] = useState(0);
  const [searchMetric, setSearchMetric] = useState<"clicks" | "impressions" | "position">("clicks");
  const [sessionMetric, setSessionMetric] = useState<"sessions" | "engagedSessions" | "engagementRate" | "viewsPerSession" | "conversions">("sessions");
  const d = live.data?.datasets;
  const days = parseInt(range);
  const gsc = searchPeriod(live.data, days);
  const portfolio = useLivePortfolio(scope.startsWith("group:") ? scope.slice(6) : undefined, days, gsc.end);
  const gscNow = gsc.total;
  const gscBefore = gsc.comparable ? searchSummary(gsc.previous) : null;
  const ga = d?.ga4_dashboard?.data;
  const sessions = analyticsPeriod(live.data, days);
  const sessionNow = sessions.total;
  const sessionBefore = sessions.previousTotal;
  const keywords = d?.keywords?.data;
  const topKeywords = [...(keywords ?? [])].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || b.volume - a.volume).slice(0, 6);
  const onpage = d?.onpage?.data;
  const health = onpage?.healthScore;
  const healthValue = Math.max(0, Math.min(100, health ?? 0));
  const scopedSites = (portfolio.data?.domains ?? []).filter((site) => scope === "portfolio" || scope.startsWith("group:") || site.domainId === scope);
  const suffix = scope !== "portfolio" && !scope.startsWith("group:") ? `?site=${encodeURIComponent(scope)}` : "";
  const link = (path: string) => `${path}${suffix}`;
  const scanCentre = suffix ? <SiteScanCentre key={scope} siteId={scope} /> : null;
  const demo = Object.values(d ?? {}).some((part) => part?.provenance.mode === "demo");
  const period = (start: string | null, end: string | null) => start && end ? `${shortDate(start)} – ${shortDate(end)}` : "Awaiting sync";
  const breakdownPeriod = ga ? `${period(ga.breakdownStartDate, ga.endDate)} · 28-day snapshot` : "28-day snapshot";
  const searchRows = gsc.current.map((row, index) => ({ date: row.date, [searchMetric]: searchMetric === "position" ? Number(row.position.toFixed(1)) : row[searchMetric], previous: gsc.comparable ? gsc.previous[index]?.[searchMetric] ?? null : null }));
  const sessionValue = (row: NonNullable<typeof ga>["series"][number]) => sessionMetric === "engagementRate" ? (row.sessions ? row.engagedSessions / row.sessions * 100 : 0) : sessionMetric === "viewsPerSession" ? (row.sessions ? row.views / row.sessions : 0) : row[sessionMetric];
  const sessionRows = sessions.current.map((row, index) => ({ date: row.date, [sessionMetric]: Number(sessionValue(row).toFixed(2)), previous: sessions.comparable && sessions.previous[index] ? Number(sessionValue(sessions.previous[index]).toFixed(2)) : null }));
  const countryTotal = ga?.countries.reduce((sum, row) => sum + row.sessions, 0) ?? 0;
  const topCountries = ga?.countries.slice(0, 5) ?? [];
  const topPages = ga?.pages.slice(0, 10) ?? [];

  function exportSearch() {
    const rows = [["Date", "Clicks", "Impressions", "Average position"], ...gsc.current.map((r: GscTimeseriesPoint) => [r.date, r.clicks, r.impressions, r.position])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `seo-command-search-${gsc.end ?? "export"}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (live.loading && !live.data) return <div className="space-y-5">{scanCentre}<div aria-busy="true" aria-label="Loading dashboard" className="space-y-5"><Skeleton className="h-72" /><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div><Skeleton className="h-72" /></div></div>;
  if (live.error && !live.data) return <div className="space-y-5">{scanCentre}<Card><Missing><div><p className="mb-2 text-sm font-medium text-ink">Dashboard couldn’t load</p><p>{live.error}</p><button onClick={live.refresh} className="mt-4 rounded border border-border px-4 py-2 text-purple">Try again</button></div></Missing></Card></div>;

  return <div id="analytics-report" className="space-y-4 animate-in">
    <PageHeader title={suffix ? `SEO Dashboard: ${live.scopeHost}` : `${activeGroup?.name ?? "Portfolio"} overview`} actions={<>{suffix&&<Link href="#website-scan-centre" className="rounded border border-border bg-card px-2.5 py-1.5 text-xs text-purple">Scan Centre</Link>}<button onClick={() => { live.refresh(); portfolio.refresh(); priorityTasks.refresh(); }} disabled={live.loading} className="flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-xs text-muted disabled:opacity-50"><RefreshCw className={cn("h-3 w-3", live.loading && "animate-spin")} /> Reload saved data</button><button onClick={exportSearch} disabled={!gsc.current.length} className="flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-xs text-muted disabled:opacity-50"><Download className="h-3 w-3" /> Export</button></>} />
    {demo && <span className="sr-only">Sample data · Local preview</span>}
    {live.error && <p role="alert" className="text-xs text-critical">Couldn’t refresh: {live.error}. Showing the last saved data.</p>}
    {suffix && <SeoDashboardSummary key={`seo-summary:${scope}`} site={scope} bundle={live.data} days={days} />}
    {!suffix && <section aria-label="Performance summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[{ label: "Organic clicks", value: number(gscNow?.clicks), change: gsc.clickChange }, { label: "Search impressions", value: number(gscNow?.impressions), change: gsc.impressionChange }, { label: "Average search position", value: gscNow?.position?.toFixed(1) ?? "—", change: gsc.positionChange }, { label: "Organic key events", value: number(sessionNow?.conversions), change: null }].map((metric) => <Card key={metric.label} className="p-4"><p className="text-sm text-muted">{metric.label}</p><p className="mt-2 text-3xl font-semibold tracking-tight tnum">{metric.value}</p><div className="mt-2"><Delta value={metric.change} invert={metric.label.includes("position")} /></div></Card>)}
    </section>}
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span>Search: {period(gsc.start, gsc.end)} · {gsc.availableDays}/{days} days</span><span>{d?.gsc_timeseries?.includedDomains ?? (d?.gsc_timeseries ? 1 : 0)} of {scopedSites.length} websites contribute search data</span><span>Key events: Analytics {period(sessions.start, sessions.end)}</span></div>
    {gsc.end && now - Date.parse(gsc.end) > 7 * 86400000 && <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">Search data ends on {shortDate(gsc.end)}. These figures describe that saved period, not current activity. <Link href={link("/scan-centre")} className="font-semibold text-purple">Review data collection</Link></p>}
    {d?.gsc_timeseries?.coverage && <details className="text-sm"><summary className="cursor-pointer text-muted">Coverage by website</summary><ul className="mt-2 grid gap-2 sm:grid-cols-2">{d.gsc_timeseries.coverage.map((site) => <li key={site.domainId}>{sites.find((entry) => entry.id === site.domainId)?.name ?? site.domainId}: {period(site.start, site.end)}{site.included === false ? " · excluded from this total" : ""}</li>)}</ul></details>}
    {suffix && <WebsitePageCoverage key={`page-coverage:${scope}`} site={scope} compact />}
    {suffix ? <NextActions site={scope} name={live.scopeLabel} bundle={live.data} tasks={priorityTasks} /> : <PriorityTasks tasks={priorityTasks} />}
    {scanCentre}
    {suffix ? <DataHealthSummary site={scope} /> : <PortfolioDataHealth data={portfolio.data} />}
    {suffix ? <details className="rounded-md border border-border bg-card px-4 py-3"><summary className="cursor-pointer text-sm font-semibold">What changed · website briefing</summary><div className="mt-3"><SiteBriefing site={scope} bundle={live.data} /></div></details> : <Card className="p-4"><h2 className="text-lg font-bold">What changed</h2><p className="mt-1 text-xs text-muted">Clicks compared with the preceding equivalent period. Open a website to investigate its pages and queries.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{[...scopedSites].filter((site) => site.searchPeriod?.clickChange != null).sort((a, b) => Math.abs(b.searchPeriod!.clickChange!) - Math.abs(a.searchPeriod!.clickChange!)).slice(0, 3).map((site) => <Link key={site.domainId} href={`/research?site=${encodeURIComponent(site.domainId)}`} className="rounded-md border border-border p-3"><span className="block text-sm font-semibold">{sites.find((entry) => entry.id === site.domainId)?.name ?? site.domainId}</span><span className="mt-1 block"><Delta value={site.searchPeriod!.clickChange} /></span><span className="mt-1 block text-xs text-muted">{number(site.searchPeriod?.clicks)} clicks · {site.searchPeriod?.availableDays}/{days} days · through {site.searchPeriod?.end ?? "unavailable"}</span></Link>)}</div>{!scopedSites.some((site) => site.searchPeriod?.clickChange != null) && <p className="mt-2 text-sm text-muted">A complete comparison period is not available yet.</p>}</Card>}
    {!suffix && <Card className={cn(styles.panel, styles.websites)}><PanelHeading icon={Layers3} title="Your Websites" subtitle={`${period(gsc.start, gsc.end)} · Same period as the headline · ${scopedSites.length} websites`} href="/sites" />
      {portfolio.error && <p className="px-5 pt-3 text-xs text-critical">Website summaries couldn’t refresh. {portfolio.error}</p>}
      {scopedSites.length ? <div className="overflow-x-auto px-5"><table className={cn("w-full text-left text-xs", styles.table)}><thead className="text-xs text-muted"><tr>{["Website", "Clicks", "Impressions", "Avg. ranking", "Click change", "Data through"].map((label) => <th key={label} className="whitespace-nowrap py-3 pr-5 font-normal">{label}</th>)}</tr></thead><tbody>{[...scopedSites].sort((a, b) => (b.searchPeriod?.clicks ?? -1) - (a.searchPeriod?.clicks ?? -1)).slice(Math.min(sitePage, Math.max(0, Math.ceil(scopedSites.length / 6) - 1)) * 6, (Math.min(sitePage, Math.max(0, Math.ceil(scopedSites.length / 6) - 1)) + 1) * 6).map((site) => <tr key={site.domainId} className="border-t border-border"><td className="py-3 pr-5"><Link href={`/portfolio?site=${encodeURIComponent(site.domainId)}`} onClick={() => setScope(site.domainId)} className="whitespace-nowrap font-medium hover:text-purple">{sites.find((s) => s.id === site.domainId)?.name ?? site.domainId}</Link></td><td className="pr-5">{number(site.searchPeriod?.clicks)}</td><td className="pr-5">{number(site.searchPeriod?.impressions)}</td><td className="pr-5">{site.searchPeriod?.position?.toFixed(1) ?? "—"}</td><td className="pr-5">{site.searchPeriod?.clickChange == null ? "—" : `${site.searchPeriod.clickChange > 0 ? "+" : ""}${site.searchPeriod.clickChange.toFixed(1)}%`}</td><td className="whitespace-nowrap pr-5 text-sm text-muted">{site.searchPeriod?.end ? `${shortDate(site.searchPeriod.end)} · ${site.searchPeriod.availableDays}/${days} days` : "Unavailable"}</td></tr>)}</tbody></table>{scopedSites.length > 6 && <div className="flex items-center justify-between border-t border-border p-3"><button className="min-h-9 px-3 text-sm disabled:opacity-40" disabled={!sitePage} onClick={() => setSitePage((page) => page - 1)}>Previous websites</button><span className="text-xs">{scopedSites.length} websites · 6 per page</span><button className="min-h-9 px-3 text-sm disabled:opacity-40" disabled={(sitePage + 1) * 6 >= scopedSites.length} onClick={() => setSitePage((page) => page + 1)}>Next websites</button></div>}</div> : <Missing>{portfolio.loading ? "Loading websites…" : "No website summaries available yet."}</Missing>}
    </Card>}
    <div className="grid gap-5 xl:grid-cols-[.85fr_1.5fr]">
      <Card className={cn("min-w-0", styles.panel, styles.search)}><PanelHeading icon={Search} title="Search Overview" subtitle={period(gsc.current[0]?.date ?? null, gsc.end)} href={link("/research")} />
        <div className="px-5 pb-4 pt-4"><div className="mb-5 grid grid-cols-3 gap-2">{([['clicks', 'Clicks'], ['impressions', 'Impressions'], ['position', 'Avg. ranking']] as const).map(([key, label]) => <button key={key} onClick={() => setSearchMetric(key)} aria-pressed={searchMetric === key} className={styles.metric}><span className="block text-sm text-muted">{label}</span><span className="my-1.5 block text-[25px] font-medium tracking-tight">{key === "position" ? gscNow?.position?.toFixed(1) ?? "—" : number(gscNow?.[key])}</span><Delta value={percentageChange(gscNow?.[key], gscBefore?.[key])} invert={key === "position"} /></button>)}</div>
          {suffix ? <SiteTrendChart site={scope} rows={searchRows} dataKey={searchMetric} color="rgb(var(--section-color))" compare={gsc.comparable} /> : <TrendChart rows={searchRows} dataKey={searchMetric} color="rgb(var(--section-color))" compare={gsc.comparable} />}
          <p className="mt-3 text-xs text-muted">{gsc.availableDays < days ? `${gsc.availableDays} of ${days} requested days available. ` : ""}{gsc.comparable ? "Dashed line: previous period." : "Full previous period is not available."}</p><Source ds={d?.gsc_timeseries} label="Search Console" />
        </div>
      </Card>
      <Card className={cn("min-w-0", styles.panel, styles.engagement)}><PanelHeading icon={Activity} title="Sessions & Engagement" subtitle={`Organic search · ${period(sessions.start, sessions.end)}${sessions.snapshotOnly ? " · saved totals" : ""}`} href={link("/research")} />
        <div className="px-5 pb-4 pt-4"><div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{([
          { key: "sessions", summary: "sessions", label: "Sessions (daily sum)" }, { key: "engagedSessions", summary: "engaged", label: "Engaged sessions" }, { key: "engagementRate", summary: "engagementRate", label: "Engagement rate" }, { key: "viewsPerSession", summary: "viewsPerSession", label: "Views / session" }, { key: "conversions", summary: "conversions", label: "Key events" },
        ] as const).map(({ key, summary, label }) => <button key={key} onClick={() => setSessionMetric(key)} aria-pressed={sessionMetric === key} className={styles.metric}><span className="block text-sm text-muted">{label}</span><span className="my-1.5 block text-[25px] font-medium tracking-tight">{sessionNow == null ? "—" : summary === "engagementRate" ? `${sessionNow[summary].toFixed(1)}%` : summary === "viewsPerSession" ? sessionNow[summary].toFixed(2) : number(sessionNow[summary])}</span><Delta value={percentageChange(sessionNow?.[summary], sessionBefore?.[summary])} /></button>)}</div>
          {!sessions.snapshotOnly && <TrendChart rows={sessionRows} dataKey={sessionMetric} color="rgb(var(--section-color))" compare={sessions.comparable} />}<p className="mt-3 text-xs text-muted">{ga ? `${ga.domainIds.length} ${ga.domainIds.length === 1 ? "website" : "websites"} included. Daily sums can differ slightly from Google’s whole-period session estimates. ${sessions.availableDays < days ? `${sessions.availableDays} of ${days} days available. ` : ""}${sessions.comparable ? "Dashed line: previous period." : "No complete comparison period."}` : "Saved Analytics totals are shown above. Daily history and breakdowns need their first successful collection. Review the website’s Google connection or refresh from Scan Centre."}</p>{ga?.qualityNote && <p className="mt-2 text-xs text-muted">{ga.qualityNote}</p>}<Source ds={d?.ga4_dashboard ?? d?.ga4_overview} label="Google Analytics" />
        </div>
      </Card>
    </div>
    {ga && <>
    <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
      <Card className={cn("min-w-0", styles.panel, styles.geography)}><PanelHeading icon={Globe2} title="Sessions by Country" subtitle={`Organic search · ${breakdownPeriod}`} />
        <div className="grid items-center gap-6 px-5 py-5 md:grid-cols-[1.4fr_1fr]">
          <svg viewBox="0 0 390 185" role="img" aria-label="World map; session counts are listed by country" className="mx-auto w-full max-w-xl"><g fill="rgb(var(--muted) / .2)">{world.points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.1" />)}</g>{topCountries.map((country, index) => { const marker = (world.markers as Record<string, number[]>)[country.code]; return marker ? <g key={`${country.code}-${country.country}`}><circle cx={marker[0]} cy={marker[1]} r="8" fill={colors[index % 4]} opacity=".16" /><circle cx={marker[0]} cy={marker[1]} r="3" fill={colors[index % 4]} /><title>{country.country}: {fullNumber(country.sessions)} sessions</title></g> : null; })}</svg>
          <div className="min-w-0">{topCountries.length ? <div className="space-y-4">{topCountries.map((country, index) => <div key={`${country.code}-${country.country}`}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate">{country.country}</span><span className="shrink-0">{number(country.sessions)} <span className="ml-2 text-muted">{countryTotal ? (country.sessions / countryTotal * 100).toFixed(1) : 0}%</span></span></div><div className="h-1.5 rounded-full bg-workspace"><div className="h-full rounded-full" style={{ width: `${countryTotal ? country.sessions / countryTotal * 100 : 0}%`, background: colors[index % 4] }} /></div></div>)}</div> : <Missing>{ga ? "No organic sessions were reported by country." : "Country data will appear after the next GA4 sync."}</Missing>}</div>
        </div><div className="border-t border-border px-5 pb-3"><Source ds={d?.ga4_dashboard ?? d?.ga4_overview} label="Google Analytics" /></div>
      </Card>
      <Card className={cn("min-w-0", styles.panel, styles.content)}><PanelHeading icon={FileText} title="Top 10 Page Titles" subtitle={`Views from organic search · ${breakdownPeriod}`} href={link("/pages")} />
        <div className="px-5 py-4">{topPages.length ? <ol className="space-y-2.5">{topPages.map((page, index) => <li key={`${page.domainId}-${page.host}-${page.path}-${page.title}`}><Link href={`/pages?site=${encodeURIComponent(page.domainId)}&page=${encodeURIComponent(`https://${page.host}${page.path}`)}`} onClick={() => setScope(page.domainId)} className="group relative flex items-center justify-between gap-3 overflow-hidden rounded px-2 py-1.5 text-sm" title={`${page.title} · ${page.host}${page.path}`}><span aria-hidden="true" className="absolute inset-y-0 left-0 rounded bg-purple/5" style={{ width: `${page.views / Math.max(topPages[0]?.views ?? 1, 1) * 100}%` }} /><span className="relative flex min-w-0 items-center gap-2"><span className="w-4 shrink-0 text-xs text-muted">{index + 1}</span><span className="truncate group-hover:text-purple">{page.title}</span></span><span className="relative shrink-0 text-muted">{number(page.views)}</span></Link></li>)}</ol> : <Missing>{ga ? "No page views were reported in this period." : "Page titles will appear after the next GA4 sync."}</Missing>}<Source ds={d?.ga4_dashboard ?? d?.ga4_overview} label="Google Analytics" /></div>
      </Card>
    </div>
    </>}

    <Card className={cn(styles.panel, styles.ranking)}>
      <PanelHeading icon={TrendingUp} title="Position Tracking" subtitle="Latest ranking and audit snapshots" href={link("/rankings")} />
      <div className="grid divide-y divide-border xl:grid-cols-[.8fr_1fr_1.7fr] xl:divide-x xl:divide-y-0">
        <section className="px-5 py-4" aria-label="Site health">
          <h3 className={styles.subheading}>Site Health <span className="ml-1 text-xs font-normal text-muted">{scope === "portfolio" || scope.startsWith("group:") ? "Average score" : "Audit score"}</span></h3>
          <div className="relative mx-auto mt-4 h-32 max-w-60">
            <svg viewBox="0 0 240 132" className="h-full w-full" aria-label={health == null ? "No health score" : `Site health ${health} out of 100`} role="img"><path d="M 25 115 A 95 95 0 0 1 215 115" fill="none" stroke="rgb(var(--border))" strokeWidth="18" /><path d="M 25 115 A 95 95 0 0 1 215 115" fill="none" stroke="var(--chart-orange)" strokeWidth="18" pathLength="100" strokeDasharray={`${healthValue} 100`} /><text x="120" y="99" textAnchor="middle" fill="rgb(var(--ink))" fontSize="34" fontWeight="500">{health == null ? "—" : `${health}%`}</text><text x="120" y="118" textAnchor="middle" fill="rgb(var(--muted))" fontSize="10">{health == null ? "Awaiting audit" : "Technical health"}</text></svg>
          </div>
          <div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted">Pages crawled</span><span>{number(onpage?.crawlRun?.pagesCrawled)}</span></div><Link href={link("/site-audit")} className="flex justify-between hover:text-purple"><span className="text-muted">Critical issues</span><span>{onpage ? onpage.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved").length : "—"}</span></Link></div>
          <Source ds={d?.onpage} label="Site audit" />
        </section>
        <section className="px-5 py-4" aria-label="Keyword distribution">
          <h3 className={styles.subheading}>Keywords <span className="ml-1 text-xs font-normal text-muted">{keywords ? `${fullNumber(keywords.length)} discovered` : "Awaiting sync"}</span></h3>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6">{[3, 10, 20, 100].map((rank, index) => {
            const count = keywords?.filter((k) => k.position != null && k.position > 0 && k.position <= rank).length;
            const before = keywords?.filter((k) => k.prevPosition != null && k.prevPosition > 0 && k.prevPosition <= rank).length;
            const hasPrevious = keywords?.length && keywords.every((k) => k.prevPosition != null);
            return <div key={rank}><div className="flex items-center justify-between text-sm text-muted"><span>Top {rank}</span><svg viewBox="0 0 28 28" className="h-6 w-6" aria-hidden="true"><circle cx="14" cy="14" r="10" fill="none" stroke="rgb(var(--border))" strokeWidth="4" /><circle cx="14" cy="14" r="10" fill="none" stroke={colors[index]} strokeWidth="4" pathLength="100" strokeDasharray={`${keywords?.length ? (count ?? 0) / keywords.length * 100 : 0} 100`} transform="rotate(-90 14 14)" /></svg></div><p className="mt-1 text-2xl font-medium tracking-tight">{number(count)}</p><p className="mt-1 text-xs text-muted">{hasPrevious && count != null && before != null ? `${count - before >= 0 ? "+" : ""}${count - before} since previous check` : "No verified comparison"}</p></div>;
          })}</div><Source ds={d?.keywords} label="DataForSEO" />
        </section>
        <section className="min-w-0 px-5 py-4" aria-label="Top keywords"><div className="mb-3 flex items-center justify-between"><h3 className={styles.subheading}>Top Keywords</h3><Link href={link("/keyword-strategy")} className="text-xs text-muted hover:text-purple">See all →</Link></div>
          {topKeywords.length ? <div className="overflow-x-auto"><table className={cn("w-full text-left text-sm", styles.table)}><thead className="text-xs font-normal text-muted"><tr>{["Keyword", "Intent", "Volume", "KD", "Position", "Change"].map((label) => <th key={label} className="whitespace-nowrap border-b border-border py-2 pr-3 font-normal last:pr-0">{label}</th>)}</tr></thead><tbody>{topKeywords.map((k) => { const change = k.position != null && k.prevPosition != null ? k.prevPosition - k.position : null; return <tr key={`${k.domainId}-${k.id}`} className="border-b border-border last:border-0"><td className="max-w-44 py-2.5 pr-3"><Link href={`/rankings?site=${encodeURIComponent(k.domainId)}`} onClick={() => setScope(k.domainId)} className="block truncate hover:text-purple" title={`${k.keyword} · ${k.domainId}`}>{k.keyword}</Link></td><td className="pr-3"><span title={k.intent} className="rounded bg-workspace px-1.5 py-0.5 text-xs text-muted">{k.intent.slice(0, 1).toUpperCase()}</span></td><td className="pr-3">{number(k.volume)}</td><td className="pr-3">{k.difficulty}</td><td className="pr-3">{k.position ?? "—"}</td><td className={change == null || change === 0 ? "text-muted" : change > 0 ? "text-success" : "text-critical"}>{change == null ? "—" : `${change > 0 ? "↑ " : change < 0 ? "↓ " : ""}${Math.abs(change)}`}</td></tr>; })}</tbody></table></div> : <Missing>No ranking keywords have been collected yet. Open Keyword strategy to review setup.</Missing>}
          <Source ds={d?.keywords} label="DataForSEO" />
        </section>
      </div>
    </Card>

  </div>;
}
