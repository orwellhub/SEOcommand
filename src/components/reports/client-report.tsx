"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Minus } from "lucide-react";
import type { DomainLiveBundle } from "@/lib/live";
import type { Domain, ReportTemplate, TechnicalIssue } from "@/lib/types";
import type { ReportBranding } from "@/reports/branding";

const MUTED = "#65708A";
const GRID = "#E6E9F0";

function compact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value);
}

function pct(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function dateLabel(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function change(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

function splitPeriod(data: Array<{ clicks: number; impressions: number }>) {
  if (data.length < 4) return { clickChange: null, impressionChange: null };
  const half = Math.floor(data.length / 2);
  const previous = data.slice(0, half);
  const current = data.slice(-half);
  const sum = (rows: typeof data, key: "clicks" | "impressions") => rows.reduce((total, row) => total + row[key], 0);
  return { clickChange: change(sum(current, "clicks"), sum(previous, "clicks")), impressionChange: change(sum(current, "impressions"), sum(previous, "impressions")) };
}

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null || Math.abs(value) < 0.05) return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#65708A]"><Minus className="h-3 w-3" />No comparison</span>;
  const positive = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${positive ? "text-[#087A57]" : "text-[#C43D46]"}`}><Icon className="h-3 w-3" />{Math.abs(value).toFixed(1)}%</span>;
}

function ReportStat({ label, value, detail, delta, invert }: { label: string; value: string; detail: string; delta?: number | null; invert?: boolean }) {
  return <div className="border-t-2 border-[var(--report-accent)] bg-white px-4 py-4 shadow-[0_1px_0_rgba(17,24,43,0.06)]"><div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#65708A]">{label}</div><div className="mt-2 font-serif text-[27px] font-bold leading-none text-[#11182B] tnum">{value}</div><div className="mt-2 flex min-h-4 items-center justify-between gap-2 text-[10px] text-[#65708A]"><span>{detail}</span>{delta !== undefined && <Delta value={delta ?? null} invert={invert} />}</div></div>;
}

function Section({ eyebrow, title, summary, children }: { eyebrow: string; title: string; summary?: string; children: ReactNode }) {
  return <section className="report-section border-t border-[#DDE2EC] pt-7"><div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]"><div><div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[var(--report-accent)]">{eyebrow}</div><h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#11182B]">{title}</h2>{summary && <p className="mt-3 text-[11px] leading-5 text-[#65708A]">{summary}</p>}</div><div className="min-w-0">{children}</div></div></section>;
}

function ChartShell({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <div className="report-chart rounded-md border border-[#DDE2EC] bg-white p-4"><div className="mb-4 flex items-baseline justify-between gap-3"><h3 className="text-xs font-extrabold text-[#11182B]">{title}</h3><span className="text-[9px] text-[#7B8498]">{note}</span></div>{children}</div>;
}

const tick = { fontSize: 9, fill: MUTED };
function ReportTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded border border-[#DDE2EC] bg-white px-3 py-2 text-[10px] shadow-lg"><div className="mb-1 font-bold text-[#11182B]">{typeof label === "string" ? dateLabel(label) : label}</div>{payload.map((item: any) => <div key={item.dataKey} className="flex items-center justify-between gap-5 text-[#65708A]"><span>{item.name}</span><span className="font-bold text-[#11182B]">{compact(Number(item.value))}</span></div>)}</div>;
}

function SearchPerformanceChart({ data, accent, secondary }: { data: NonNullable<DomainLiveBundle["datasets"]["gsc_timeseries"]>["data"]; accent: string; secondary: string }) {
  return <ResponsiveContainer width="100%" height={240}><ComposedChart data={data} margin={{ top: 6, right: 0, left: -24, bottom: 0 }}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={34} tickFormatter={dateLabel} /><YAxis yAxisId="clicks" tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} /><YAxis yAxisId="impressions" orientation="right" tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} /><Tooltip content={<ReportTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: MUTED }} /><Area isAnimationActive={false} yAxisId="clicks" type="monotone" dataKey="clicks" name="Clicks" stroke={accent} fill={accent} fillOpacity={0.12} strokeWidth={2.2} /><Line isAnimationActive={false} yAxisId="impressions" type="monotone" dataKey="impressions" name="Impressions" stroke={secondary} strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer>;
}

function SimpleLineChart({ data, lines }: { data: Record<string, number | string>[]; lines: Array<{ key: string; name: string; color: string }> }) {
  return <ResponsiveContainer width="100%" height={220}><LineChart data={data} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={34} tickFormatter={dateLabel} /><YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} /><Tooltip content={<ReportTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />{lines.map((line) => <Line key={line.key} isAnimationActive={false} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.2} dot={false} />)}</LineChart></ResponsiveContainer>;
}

function SimpleBarChart({ data, xKey, bars }: { data: Record<string, number | string>[]; xKey: string; bars: Array<{ key: string; name: string; color: string }> }) {
  return <ResponsiveContainer width="100%" height={220}><BarChart data={data} margin={{ top: 6, right: 0, left: -24, bottom: 0 }}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} /><YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} /><Tooltip content={<ReportTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />{bars.map((bar) => <Bar key={bar.key} isAnimationActive={false} dataKey={bar.key} name={bar.name} fill={bar.color} radius={[4, 4, 0, 0]} maxBarSize={42} />)}</BarChart></ResponsiveContainer>;
}

function ReportTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="overflow-hidden rounded-md border border-[#DDE2EC]"><table className="w-full table-fixed border-collapse"><thead><tr className="bg-[#F2F4F8]">{headers.map((header, index) => <th key={header} className={`px-3 py-2.5 text-[9px] font-extrabold uppercase tracking-[0.11em] text-[#65708A] ${index ? "text-right" : "text-left"}`}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[#E6E9F0]">{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-3 py-2.5 text-[10px] leading-4 text-[#11182B] ${cellIndex ? "text-right tnum" : "text-left font-semibold"}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function NoData({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-[#CBD1DE] bg-[#F7F8FB] px-4 py-5 text-center text-[10px] text-[#65708A]">{label} will appear after the connected data source completes its first sync.</div>;
}

function severityRank(issue: TechnicalIssue) {
  return issue.severity === "critical" ? 4 : issue.severity === "high" ? 3 : issue.severity === "medium" ? 2 : 1;
}

export function ClientReport({ site, template, branding, bundle }: { site: Domain; template: ReportTemplate; branding: ReportBranding; bundle: DomainLiveBundle }) {
  const gsc = bundle.datasets.gsc_totals?.data;
  const gscSeries = bundle.datasets.gsc_timeseries?.data ?? [];
  const ga4 = bundle.datasets.ga4_overview?.data;
  const onpage = bundle.datasets.onpage?.data;
  const positions = bundle.datasets.position_buckets?.data ?? [];
  const visibility = bundle.datasets.visibility_series?.data ?? [];
  const rankings = bundle.datasets.rank_snapshots?.data ?? [];
  const movers = bundle.datasets.gsc_movers?.data;
  const pages = bundle.datasets.ga4_landing_pages?.data ?? [];
  const queries = bundle.datasets.gsc_queries?.data ?? [];
  const channels = bundle.datasets.ga4_channels?.data ?? [];
  const recommendations = [...(bundle.datasets.recommendations?.data ?? [])].sort((a, b) => b.priorityScore - a.priorityScore);
  const backlinkHistory = bundle.datasets.backlink_history?.data ?? [];
  const referring = bundle.datasets.referring_domains?.data ?? [];
  const backlinks = bundle.datasets.backlinks?.data ?? [];
  const ai = bundle.datasets.ai_prompts?.data ?? [];
  const { clickChange, impressionChange } = splitPeriod(gscSeries);
  const rankGains = rankings.filter((row) => row.position < row.prevPosition).length;
  const rankLosses = rankings.filter((row) => row.position > row.prevPosition).length;
  const top10 = rankings.filter((row) => row.position <= 10).length;
  const aiMentionRate = ai.length ? ai.reduce((total, row) => total + row.mentionRate, 0) / ai.length : null;
  const aiCitationRate = ai.length ? ai.reduce((total, row) => total + row.citationRate, 0) / ai.length : null;
  const templateId = template.id;
  const performanceReport = ["tpl-domain", "tpl-exec", "tpl-rank"].includes(templateId);
  const rankingReport = ["tpl-domain", "tpl-rank"].includes(templateId);
  const technicalReport = ["tpl-domain", "tpl-tech"].includes(templateId);
  const backlinkReport = ["tpl-domain", "tpl-backlink"].includes(templateId);
  const aiReport = ["tpl-domain", "tpl-ai"].includes(templateId);
  const periodStart = bundle.datasets.gsc_totals?.provenance.rangeStart ?? bundle.datasets.ga4_overview?.provenance.rangeStart;
  const periodEnd = bundle.datasets.gsc_totals?.provenance.rangeEnd ?? bundle.datasets.ga4_overview?.provenance.rangeEnd;
  const period = periodStart && periodEnd ? `${new Date(`${periodStart}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} — ${new Date(`${periodEnd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "Latest available reporting period";
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const technicalCounts = ["critical", "high", "medium", "low"].map((severity) => ({ severity: severity[0]!.toUpperCase() + severity.slice(1), issues: onpage?.issues.filter((issue) => issue.severity === severity && issue.status !== "resolved").length ?? 0 }));
  const aiPlatforms = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Google AI", "Copilot"].map((platform) => {
    const key = platform === "ChatGPT" ? "chatgpt" : platform === "Google AI" ? "google_ai" : platform.toLowerCase();
    const rows = ai.filter((prompt) => prompt.platforms.some((item) => item === key || (key === "google_ai" && item.startsWith("google_ai"))));
    return { platform, mentions: rows.length ? rows.reduce((sum, row) => sum + row.mentionRate, 0) / rows.length : 0, citations: rows.length ? rows.reduce((sum, row) => sum + row.citationRate, 0) / rows.length : 0 };
  }).filter((row) => row.mentions || row.citations);
  const insights: string[] = [];
  if (clickChange != null) insights.push(`Organic clicks ${clickChange >= 0 ? "increased" : "decreased"} ${Math.abs(clickChange).toFixed(1)}% in the latest half of the reporting period.`);
  if (gsc) insights.push(`Search visibility generated ${compact(gsc.clicks)} clicks from ${compact(gsc.impressions)} impressions at an average position of ${gsc.position.toFixed(1)}.`);
  if (ga4) insights.push(`Organic landing activity produced ${compact(ga4.sessions)} sessions and ${compact(ga4.conversions)} recorded conversions.`);
  if (onpage) insights.push(`Technical health is ${Math.round(onpage.healthScore)}/100 with ${onpage.issues.filter((issue) => issue.status !== "resolved").length} open issues across the latest crawl.`);
  if (!insights.length) insights.push("Connected reporting sources have not yet stored enough data for a performance narrative.");

  return <article id="client-report" className="client-report mx-auto max-w-[940px] overflow-hidden bg-[#F7F8FB] text-[#11182B] shadow-[0_24px_80px_rgba(17,24,43,0.12)]" style={{ "--report-accent": branding.accent, "--report-secondary": branding.secondaryColor } as CSSProperties}>
    <section className="report-cover relative flex min-h-[680px] flex-col overflow-hidden bg-[#11182B] px-10 py-10 text-white sm:px-14 sm:py-12">
      <div className="absolute -right-28 -top-32 h-[440px] w-[440px] rounded-full border-[84px] border-white/[0.035]" />
      <div className="absolute inset-y-0 left-0 w-2" style={{ background: `linear-gradient(180deg, ${branding.accent}, ${branding.secondaryColor})` }} />
      <div className="relative flex items-start justify-between gap-6">
        {branding.logoUrl ? <>
          {/* Report logos can be supplied from any client-owned CDN, so they intentionally bypass the Next image host allow-list. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoUrl} alt={branding.brandName} className="max-h-14 max-w-64 object-contain object-left brightness-0 invert" />
        </> : <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-md text-sm font-black text-white" style={{ background: branding.accent }}>{branding.brandName.slice(0, 2).toUpperCase()}</div><span className="text-sm font-bold tracking-tight">{branding.brandName}</span></div>}
        <div className="text-right text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">Confidential<br />Client report</div>
      </div>
      <div className="relative mt-auto max-w-2xl pb-12">
        <div className="mb-6 h-1 w-20" style={{ background: branding.secondaryColor }} />
        <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/45">{template.type} · {site.host}</div>
        <h1 className="mt-4 font-serif text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl">{template.name}</h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-white/60">A measured account of organic search performance, technical quality and the next actions most likely to improve results.</p>
      </div>
      <div className="relative grid gap-5 border-t border-white/10 pt-6 text-[10px] sm:grid-cols-3"><div><div className="uppercase tracking-[0.15em] text-white/35">Reporting period</div><div className="mt-1 font-bold text-white/80">{period}</div></div><div><div className="uppercase tracking-[0.15em] text-white/35">Prepared by</div><div className="mt-1 font-bold text-white/80">{branding.preparedBy}</div></div><div><div className="uppercase tracking-[0.15em] text-white/35">Issued</div><div className="mt-1 font-bold text-white/80">{generated}</div></div></div>
    </section>

    <div className="report-body space-y-10 px-6 py-10 sm:px-10 sm:py-12">
      <Section eyebrow="Executive reading" title="Performance at a glance" summary="The most important findings from the latest connected search, analytics and technical datasets.">
        <div className="rounded-md bg-[#11182B] p-5 text-white"><div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/45">Executive summary</div><div className="mt-3 space-y-2.5">{insights.map((insight) => <div key={insight} className="flex gap-3 text-[11px] leading-5 text-white/75"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--report-secondary)]" />{insight}</div>)}</div></div>
      </Section>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-[#DDE2EC] lg:grid-cols-4">
        <ReportStat label="Organic clicks" value={compact(gsc?.clicks)} detail="Search Console" delta={clickChange} />
        <ReportStat label="Impressions" value={compact(gsc?.impressions)} detail="Search visibility" delta={impressionChange} />
        <ReportStat label="Organic sessions" value={compact(ga4?.sessions)} detail="Google Analytics" />
        <ReportStat label="Conversions" value={compact(ga4?.conversions)} detail="Recorded key events" />
        <ReportStat label="Average position" value={gsc ? gsc.position.toFixed(1) : "—"} detail="Lower is better" />
        <ReportStat label="Top 10 keywords" value={rankings.length ? compact(top10) : "—"} detail={`${rankGains} gained · ${rankLosses} declined`} />
        <ReportStat label="Technical health" value={onpage ? `${Math.round(onpage.healthScore)}/100` : "—"} detail={onpage ? `${onpage.crawlRun?.pagesCrawled ?? 0} pages assessed` : "Awaiting crawl"} />
        <ReportStat label="AI mention rate" value={pct(aiMentionRate)} detail="Tracked prompts" />
      </div>

      {performanceReport && <Section eyebrow="01 · Search demand" title="Organic performance" summary="Search Console shows discovery and click behaviour; Analytics shows what visitors did after arriving.">
        <div className="space-y-4">
          {gscSeries.length ? <ChartShell title="Search demand and response" note="Daily Search Console data"><SearchPerformanceChart data={gscSeries} accent={branding.accent} secondary={branding.secondaryColor} /></ChartShell> : <NoData label="Daily search performance" />}
          {(queries.length || channels.length) ? <div className="grid gap-4 xl:grid-cols-2">
            {queries.length ? <div><div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#65708A]">Leading search queries</div><ReportTable headers={["Query", "Clicks", "Position"]} rows={[...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 6).map((row) => [row.key, compact(row.clicks), row.position.toFixed(1)])} /></div> : <NoData label="Search query detail" />}
            {channels.length ? <div><div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#65708A]">Traffic contribution</div><ReportTable headers={["Channel", "Sessions", "Conversions"]} rows={[...channels].sort((a, b) => b.sessions - a.sessions).slice(0, 6).map((row) => [row.channel, compact(row.sessions), compact(row.conversions)])} /></div> : <NoData label="Traffic channel detail" />}
          </div> : null}
          {pages.length ? <><div className="pt-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#65708A]">Leading organic landing pages</div><ReportTable headers={["Landing page", "Sessions", "Conversions", "Engagement"]} rows={[...pages].sort((a, b) => b.sessions - a.sessions).slice(0, 7).map((page) => [page.landingPage, compact(page.sessions), compact(page.conversions), pct(page.engagementRate)])} /></> : null}
        </div>
      </Section>}

      {rankingReport && <Section eyebrow="02 · Market position" title="Rankings and visibility" summary="Distribution shows where tracked keywords sit today; movement tables identify demand that gained or lost traction.">
        <div className="space-y-4"><div className="grid gap-4 xl:grid-cols-2">{positions.length ? <ChartShell title="Ranking distribution" note="Current vs previous"><SimpleBarChart data={positions as unknown as Record<string, number | string>[]} xKey="label" bars={[{ key: "count", name: "Current", color: branding.accent }, { key: "prevCount", name: "Previous", color: "#C8CEDA" }]} /></ChartShell> : <NoData label="Tracked keyword distribution" />}{visibility.length ? <ChartShell title="Visibility trend" note="Daily visibility index"><SimpleLineChart data={visibility as unknown as Record<string, number | string>[]} lines={[{ key: "value", name: "Visibility", color: branding.secondaryColor }]} /></ChartShell> : <NoData label="Visibility history" />}</div>{movers && (movers.gains.length || movers.losses.length) ? <div className="grid gap-4 xl:grid-cols-2"><ReportTable headers={["Gaining query", "Before", "Now", "Change"]} rows={movers.gains.slice(0, 6).map((row) => [row.key, compact(row.clicksBefore), compact(row.clicksNow), <span key={row.key} className="font-bold text-[#087A57]">+{compact(row.change)}</span>])} /><ReportTable headers={["Declining query", "Before", "Now", "Change"]} rows={movers.losses.slice(0, 6).map((row) => [row.key, compact(row.clicksBefore), compact(row.clicksNow), <span key={row.key} className="font-bold text-[#C43D46]">{compact(row.change)}</span>])} /></div> : null}</div>
      </Section>}

      {technicalReport && <Section eyebrow="03 · Technical quality" title="Crawl health and risk" summary="Issues are ranked by severity and affected-page count so remediation can begin with material search risk.">
        <div className="space-y-4">{onpage ? <><div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><div className="flex min-h-[260px] flex-col justify-between rounded-md p-6 text-white" style={{ background: branding.accent }}><div><div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/55">Technical health</div><div className="mt-3 font-serif text-6xl font-bold">{Math.round(onpage.healthScore)}</div><div className="text-xs text-white/65">out of 100</div></div><div className="border-t border-white/20 pt-4 text-[10px] text-white/70">{onpage.crawlRun?.pagesCrawled ?? 0} pages crawled · {onpage.crawlRun?.newIssues ?? 0} new · {onpage.crawlRun?.resolvedIssues ?? 0} resolved</div></div><ChartShell title="Open issues by severity" note="Latest crawl"><SimpleBarChart data={technicalCounts} xKey="severity" bars={[{ key: "issues", name: "Issues", color: branding.secondaryColor }]} /></ChartShell></div><ReportTable headers={["Priority issue", "Severity", "Pages", "Recommended action"]} rows={[...onpage.issues].filter((issue) => issue.status !== "resolved").sort((a, b) => severityRank(b) - severityRank(a) || b.affectedPages - a.affectedPages).slice(0, 8).map((issue) => [issue.title, <span key={issue.id} className={`font-bold uppercase ${issue.severity === "critical" || issue.severity === "high" ? "text-[#C43D46]" : "text-[#9A6B08]"}`}>{issue.severity}</span>, compact(issue.affectedPages), issue.recommendedFix])} /></> : <NoData label="Technical crawl evidence" />}</div>
      </Section>}

      {backlinkReport && <Section eyebrow="04 · Authority" title="Backlink profile" summary="Link growth is judged through referring-domain quality and movement, not raw backlink volume alone.">
        <div className="space-y-4"><div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-[#DDE2EC]"><ReportStat label="Referring domains" value={compact(referring.length)} detail="Latest stored profile" /><ReportStat label="Active backlinks" value={compact(backlinks.filter((row) => row.status !== "lost").length)} detail="Provider sample" /><ReportStat label="Follow links" value={pct(backlinks.length ? backlinks.filter((row) => row.follow).length / backlinks.length * 100 : null)} detail="Of stored links" /></div>{backlinkHistory.length ? <ChartShell title="Link profile history" note="Backlinks and referring domains"><SimpleLineChart data={backlinkHistory as unknown as Record<string, number | string>[]} lines={[{ key: "backlinks", name: "Backlinks", color: branding.accent }, { key: "referringDomains", name: "Referring domains", color: branding.secondaryColor }]} /></ChartShell> : <NoData label="Backlink history" />}{referring.length ? <ReportTable headers={["Strong referring domain", "Authority", "Backlinks", "Link type"]} rows={[...referring].sort((a, b) => b.authority - a.authority).slice(0, 7).map((row) => [row.host, compact(row.authority), compact(row.backlinks), row.follow ? "Follow" : "Nofollow"])} /> : null}</div>
      </Section>}

      {aiReport && <Section eyebrow="05 · AI discovery" title="AI visibility" summary="Mention and citation rates show whether tracked answer engines recognise the brand and use its website as evidence.">
        <div className="space-y-4"><div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-[#DDE2EC]"><ReportStat label="Mention rate" value={pct(aiMentionRate)} detail={`${ai.length} tracked prompts`} /><ReportStat label="Citation rate" value={pct(aiCitationRate)} detail="Owned-source citations" /></div>{aiPlatforms.length ? <ChartShell title="Visibility by answer engine" note="Average across tracked prompts"><SimpleBarChart data={aiPlatforms} xKey="platform" bars={[{ key: "mentions", name: "Mentions %", color: branding.accent }, { key: "citations", name: "Citations %", color: branding.secondaryColor }]} /></ChartShell> : <NoData label="AI prompt visibility" />}{ai.length ? <ReportTable headers={["Tracked prompt", "Mention", "Citation", "Avg. recommendation"]} rows={[...ai].sort((a, b) => b.mentionRate - a.mentionRate).slice(0, 7).map((row) => [row.prompt, pct(row.mentionRate), pct(row.citationRate), row.avgPosition == null ? "—" : `#${row.avgPosition.toFixed(1)}`])} /> : null}</div>
      </Section>}

      <Section eyebrow="Next reporting cycle" title="Priorities and actions" summary="These recommendations are generated from the latest stored evidence and ranked by expected impact, confidence and effort.">
        {recommendations.length ? <div className="space-y-2.5">{recommendations.slice(0, 7).map((item, index) => <div key={item.id} className="grid gap-3 rounded-md border border-[#DDE2EC] bg-white p-4 sm:grid-cols-[34px_minmax(0,1fr)_110px]"><div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: index < 2 ? branding.accent : "#8A93A7" }}>{index + 1}</div><div><div className="text-xs font-extrabold text-[#11182B]">{item.title}</div><div className="mt-1 text-[10px] leading-4 text-[#65708A]">{item.evidence}</div><div className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--report-accent)]">{item.estImpact}</div></div><div className="text-right text-[9px] text-[#65708A]"><div className="font-black text-[#11182B]">Priority {item.priorityScore}</div><div className="mt-1 capitalize">{item.confidence} confidence</div><div className="mt-1">Effort {item.effort}</div></div></div>)}</div> : <NoData label="Evidence-backed recommendations" />}
      </Section>

      <div className="flex items-center justify-between gap-4 border-t border-[#DDE2EC] pt-5 text-[9px] text-[#7B8498]"><span>{branding.footerText}</span><span className="shrink-0">{branding.contactEmail}{branding.showPoweredBy ? `${branding.contactEmail ? " · " : ""}Powered by SEOcommand` : ""}</span></div>
    </div>
  </article>;
}
