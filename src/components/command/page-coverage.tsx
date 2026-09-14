"use client";

import Link from "next/link";
import { ArrowUpRight, Files, ScanSearch, SearchCheck } from "lucide-react";
import { useJson } from "@/lib/use-live";
import type { SiteCommand } from "@/lib/command-model";
import { metric, stamp } from "./shared";

export function WebsitePageCoverage({ site, compact = false }: { site: string; compact?: boolean }) {
  const state = useJson<SiteCommand>(`/api/command?site=${encodeURIComponent(site)}`, 0);
  return <PageCoverage compact={compact} data={state.data} loading={state.loading} error={Boolean(state.error)} refresh={state.refresh} />;
}

export function PageCoverage({ data, loading = false, error = false, refresh, compact = false }: {
  compact?: boolean; data: SiteCommand | null; loading?: boolean; error?: boolean; refresh?: () => void;
}) {
  const stats = data?.pageStats;
  const site = encodeURIComponent(data?.site.id ?? "");
  const cards = [
    { label: "Total pages known", value: stats?.known, icon: Files, color: "#335CFF", detail: "Unique URLs in saved page evidence", note: "Full website total is not yet verified.", href: `/pages?site=${site}`, action: "View pages" },
    { label: "Pages crawled by Google", value: stats?.crawled, icon: ScanSearch, color: "#E27A25", detail: stats?.inspected ? `Google crawl confirmed · ${metric(stats.inspected)} URLs checked` : "No saved Google crawl checks", note: stats?.lastGoogleCrawl ? `Latest Google crawl ${stamp(stats.lastGoogleCrawl)}` : "No Google crawl date reported yet.", href: `/health?site=${site}&view=indexing`, action: "View Google crawl dates" },
    { label: "Pages indexed by Google", value: stats?.indexed, icon: SearchCheck, color: "#238765", detail: stats?.inspected ? `Among ${metric(stats.inspected)} inspected URLs${stats.unknownVerdicts ? ` · ${metric(stats.unknownVerdicts)} unknown` : ""}` : "No saved Google index checks", note: stats?.inspectedAt ? `Last inspected ${stamp(stats.inspectedAt)}` : "Inspect pages to check their Google status.", href: `/health?site=${site}&view=indexing`, action: "View indexing" },
  ];
  if (compact) return <section aria-label="Page coverage" aria-busy={loading} className="overflow-hidden rounded-md border border-border bg-card"><div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">{cards.map(({label,value,href,icon: Icon,color,detail,note,action}) => <div key={label} className="px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5" style={{color}} />{label}</div><div className="mt-1 flex items-baseline justify-between gap-2"><span className="text-2xl font-semibold tnum">{metric(value)}</span>{data && <Link href={href} title={action} className="text-xs text-purple">View evidence →</Link>}</div><details className="mt-1 text-[11px] text-muted"><summary className="cursor-pointer">{loading && !data ? "Loading…" : stats ? detail : "Saved counts unavailable"}</summary><p className="mt-1 leading-4">{note}</p></details></div>)}</div>{error && <p role="alert" className="border-t border-border px-4 py-2 text-xs text-critical">Counts could not refresh. <button onClick={refresh} className="underline">Retry</button></p>}<p className="border-t border-border px-4 py-2 text-[11px] text-muted">Google counts cover inspected URLs only; unchecked pages are unknown.</p></section>;
  return <section aria-label="Page coverage" aria-busy={loading} className="rounded-lg border border-border bg-card p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-lg font-bold">Page coverage</h2><p className="mt-1 text-xs text-muted">{data ? `${data.site.host} · ` : ""}Your pages, crawl coverage and Google index checks in one place.</p></div>
      {refresh && <button onClick={refresh} disabled={loading} className="min-h-9 rounded-md border border-border px-3 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50">{loading ? "Loading…" : "Reload counts"}</button>}
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-critical">Page counts could not refresh.{data ? " Showing the last saved results." : " Try reloading the counts."}</p>}
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map(({ label, value, icon: Icon, color, detail, note, href, action }) => <div key={label} className="flex min-w-0 flex-col rounded-md border border-border border-t-[3px] p-4" style={{ borderTopColor: color }}>
        <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{label}</h3><Icon aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color }} /></div>
        <p className="my-2 text-4xl font-semibold tracking-tight tnum">{!stats && loading ? <span className="text-base text-muted">Loading…</span> : metric(value)}</p>
        <p className="text-sm text-muted">{!stats ? "Saved counts are unavailable." : detail}</p>
        <p className="mt-2 text-xs leading-5 text-muted">{stats ? note : ""}</p>
        {data && <Link href={href} className="mt-auto inline-flex min-h-10 items-center gap-1 pt-3 text-sm font-semibold text-purple hover:underline">{action}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>}
      </div>)}
    </div>
    {stats && <p className="mt-3 text-xs leading-5 text-muted">Google counts cover inspected URLs only; they are not whole-site totals. {stats.inspected ? `Last checked ${stamp(stats.inspectedAt)}. ` : ""}Unchecked pages have an unknown status.</p>}
  </section>;
}
