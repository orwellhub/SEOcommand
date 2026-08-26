"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Braces, GitCompareArrows, Network, Play, ScanLine } from "lucide-react";
import { useResolvedDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { fullNumber } from "@/lib/format";

interface CrawlRun { id: string; status: string; maxPages: number; pagesCrawled: number; issueCounts: Record<string, number>; diffSummary: Record<string, number>; startedAt: string; completedAt: string | null; lastError: string | null }
interface CrawlPage { id: string; url: string; finalUrl: string | null; statusCode: number | null; depth: number; renderedTitle: string | null; canonical: string | null; h1Count: number; wordCount: number; jsDependent: boolean; indexable: boolean; schemaTypes: string[]; hreflang: Record<string, string>; internalLinks: number; externalLinks: number; loadTimeMs: number | null; issues: string[] }
interface CrawlData { run: CrawlRun | null; pages: CrawlPage[]; orphanUrls: string[] }

export default function TechnicalCrawlerPage() {
  const domain = useResolvedDomain();
  const [data, setData] = useState<CrawlData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/technical/browser-crawl?site=${encodeURIComponent(domain.id)}`);
    const body = await response.json();
    if (response.ok) setData(body); else setError(body.error ?? "Rendered crawl could not be loaded.");
  }, [domain.id]);
  useEffect(() => { setData(null); void load(); }, [load]);
  const queue = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/technical/browser-crawl", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteSlug: domain.id, maxPages: 200 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Crawl could not be queued.");
      setError("Crawl queued. The hourly browser runner will process it without blocking the dashboard.");
    } catch (err) { setError(err instanceof Error ? err.message : "Crawl could not be queued."); }
    finally { setBusy(false); }
  };

  const columns = useMemo<Column<CrawlPage>[]>(() => [
    { key: "url", header: "Rendered URL", sortValue: (row) => row.url, render: (row) => <div><div className="max-w-lg truncate font-medium text-ink">{row.url.replace(/^https?:\/\//, "")}</div><div className="mt-0.5 max-w-lg truncate text-2xs text-muted">{row.renderedTitle || "No rendered title"}</div></div> },
    { key: "status", header: "HTTP", align: "right", sortValue: (row) => row.statusCode ?? 0, render: (row) => <span className={(row.statusCode ?? 0) >= 400 ? "font-semibold text-critical" : "text-ink"}>{row.statusCode ?? "—"}</span> },
    { key: "depth", header: "Depth", align: "right", sortValue: (row) => row.depth, render: (row) => row.depth },
    { key: "render", header: "Rendering", render: (row) => <StatusBadge label={row.jsDependent ? "JS dependent" : "HTML parity"} tone={row.jsDependent ? "warning" : "success"} /> },
    { key: "index", header: "Indexability", render: (row) => <StatusBadge label={row.indexable ? "Indexable" : "Blocked"} tone={row.indexable ? "success" : "critical"} /> },
    { key: "schema", header: "Schema", align: "right", sortValue: (row) => row.schemaTypes.length, render: (row) => row.schemaTypes.length || "—" },
    { key: "links", header: "Internal links", align: "right", sortValue: (row) => row.internalLinks, render: (row) => row.internalLinks },
    { key: "issues", header: "Issues", align: "right", sortValue: (row) => row.issues.length, render: (row) => <span className={row.issues.length ? "font-semibold text-critical" : "text-success"}>{row.issues.length}</span> },
  ], []);
  const issues = Object.entries(data?.run?.issueCounts ?? {}).sort((a, b) => b[1] - a[1]);
  const diff = data?.run?.diffSummary ?? {};

  return <div className="animate-in space-y-5">
    <PageHeader title="Rendered technical crawler" description="Browser-rendered evidence layered over the full DataForSEO crawl: JavaScript parity, internal link graph, schema, hreflang and change detection." actions={<Button variant="primary" onClick={queue} disabled={busy}><Play className="h-4 w-4" />{busy ? "Queuing…" : "Queue rendered crawl"}</Button>} />
    {error && <div role="status" className={`rounded-md border p-3 text-xs ${error.startsWith("Crawl queued") ? "border-success/20 bg-success/5 text-success" : "border-critical/20 bg-critical/5 text-critical"}`}>{error}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiCard label="Rendered pages" value={data?.run ? fullNumber(data.run.pagesCrawled) : "—"} accent />
      <KpiCard label="JS-dependent" value={data?.run ? String(data.run.issueCounts.javascript_dependent_content ?? 0) : "—"} />
      <KpiCard label="Orphan candidates" value={data?.run ? String(data.orphanUrls.length) : "—"} />
      <KpiCard label="Changed pages" value={data?.run ? String(diff.contentChanged ?? 0) : "—"} />
      <KpiCard label="Indexability changes" value={data?.run ? String(diff.indexabilityChanged ?? 0) : "—"} />
    </div>
    {data?.run ? <>
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3"><CardHeader title="Crawl comparison" subtitle="Changes against the previous browser-rendered run" action={<GitCompareArrows className="h-4 w-4 text-purple" />} /><div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">{[{ label: "Added", value: diff.added }, { label: "Removed", value: diff.removed }, { label: "Content", value: diff.contentChanged }, { label: "Titles", value: diff.titleChanged }, { label: "Canonicals", value: diff.canonicalChanged }, { label: "Indexability", value: diff.indexabilityChanged }].map((item) => <div key={item.label} className="bg-card p-4"><div className="text-2xs uppercase tracking-wide text-muted">{item.label}</div><div className="mt-1 text-xl font-semibold text-ink">{item.value ?? 0}</div></div>)}</div></Card>
        <Card className="xl:col-span-2"><CardHeader title="Issue fingerprint" subtitle="Affected rendered pages by rule" action={<ScanLine className="h-4 w-4 text-purple" />} /><div className="max-h-64 divide-y divide-border overflow-y-auto">{issues.length ? issues.map(([issue, count]) => <div key={issue} className="flex items-center justify-between gap-3 px-4 py-2.5"><div className="text-xs text-ink">{issue.replace(/_/g, " ")}</div><span className="tnum text-xs font-semibold text-critical">{count}</span></div>) : <div className="p-4 text-xs text-muted">No rendered issues detected.</div>}</div></Card>
      </div>
      <Card><CardHeader title="Rendered page inventory" subtitle={`${data.run.status} · ${data.run.pagesCrawled.toLocaleString()} of ${data.run.maxPages.toLocaleString()} page allowance`} action={<div className="flex items-center gap-2"><Network className="h-4 w-4 text-purple" /><Braces className="h-4 w-4 text-muted" /></div>} /><DataTable<CrawlPage> rows={data.pages} columns={columns} searchPlaceholder="Search URLs, titles or issues…" rowKey={(row) => row.id} /></Card>
    </> : <EmptyState icon={<ScanLine className="h-6 w-6" />} title="No rendered crawl yet" description="Queue the first crawl. The browser worker will inspect rendered pages without slowing the dashboard." />}
  </div>;
}
