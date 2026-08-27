"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, ExternalLink, Search, Swords } from "lucide-react";
import { useResolvedDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { fullNumber } from "@/lib/format";

interface ExplorerResult {
  targetHost: string;
  capturedAt: string;
  overview: { organicKeywords: number | null; organicTraffic: number | null; paidKeywords: number | null; paidTraffic: number | null; estimatedTrafficCost: number | null };
  keywords: Array<{ keyword: string; position: number | null; volume: number | null; difficulty: number | null; intent: string | null; url: string | null; traffic: number | null }>;
  pages: Array<{ url: string; keywords: number | null; traffic: number | null; trafficCost: number | null }>;
  backlinks: { rank: number | null; backlinks: number | null; referringDomains: number | null; spamScore: number | null };
}
type RecentRun = ExplorerResult & { id: string };

export default function CompetitorsPage() {
  const domain = useResolvedDomain();
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [tab, setTab] = useState<"keywords" | "pages">("keywords");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    setRecent([]);
    fetch(`/api/competitor-explorer?site=${encodeURIComponent(domain.id)}`).then((response) => response.json()).then((body) => { if (active) setRecent(body.runs ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, [domain.id]);

  const explore = async () => {
    if (!target.trim()) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/competitor-explorer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteSlug: domain.id, targetHost: target }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Competitor scan failed.");
      setResult(body.result);
      setRecent((items) => [{ id: body.result.capturedAt, ...body.result }, ...items].slice(0, 10));
    } catch (err) { setError(err instanceof Error ? err.message : "Competitor scan failed."); }
    finally { setBusy(false); }
  };

  const keywordColumns = useMemo<Column<ExplorerResult["keywords"][number]>[]>(() => [
    { key: "keyword", header: "Keyword", sortValue: (row) => row.keyword, render: (row) => <span className="font-medium text-ink">{row.keyword}</span> },
    { key: "intent", header: "Intent", render: (row) => <StatusBadge label={row.intent ?? "unknown"} tone="neutral" /> },
    { key: "position", header: "Position", align: "right", sortValue: (row) => row.position ?? 999, render: (row) => row.position ?? "—" },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume ?? 0, render: (row) => row.volume == null ? "—" : fullNumber(row.volume) },
    { key: "difficulty", header: "Difficulty", align: "right", sortValue: (row) => row.difficulty ?? 0, render: (row) => row.difficulty ?? "—" },
    { key: "url", header: "Ranking page", render: (row) => row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="flex max-w-64 items-center gap-1 truncate text-purple hover:underline">{row.url.replace(/^https?:\/\//, "")}<ExternalLink className="h-3 w-3 shrink-0" /></a> : "—" },
  ], []);
  const pageColumns = useMemo<Column<ExplorerResult["pages"][number]>[]>(() => [
    { key: "url", header: "Page", sortValue: (row) => row.url, render: (row) => <a href={row.url} target="_blank" rel="noreferrer" className="block max-w-xl truncate font-medium text-purple hover:underline">{row.url.replace(/^https?:\/\//, "")}</a> },
    { key: "keywords", header: "Keywords", align: "right", sortValue: (row) => row.keywords ?? 0, render: (row) => row.keywords == null ? "—" : fullNumber(row.keywords) },
    { key: "traffic", header: "Estimated traffic", align: "right", sortValue: (row) => row.traffic ?? 0, render: (row) => row.traffic == null ? "—" : fullNumber(Math.round(row.traffic)) },
    { key: "value", header: "Traffic value", align: "right", sortValue: (row) => row.trafficCost ?? 0, render: (row) => row.trafficCost == null ? "—" : `$${fullNumber(Math.round(row.trafficCost))}` },
  ], []);

  return <div className="animate-in space-y-5">
    <PageHeader title="Competitor explorer" description={`Reverse-engineer any competitor against ${domain.name}'s approved market and budget.`} />
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[1fr_auto]">
        <div className="p-5"><div className="text-2xs font-medium uppercase tracking-wide text-muted">Competitor domain</div><div className="mt-2 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" /><input aria-label="Competitor domain" value={target} onChange={(event) => setTarget(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void explore()} placeholder="competitor.com" className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-purple" /></div><Button variant="primary" onClick={explore} disabled={busy || !target.trim()}>{busy ? "Scanning…" : "Explore"}<ArrowRight className="h-4 w-4" /></Button></div>{error && <p role="alert" className="mt-2 text-xs text-critical">{error}</p>}<p className="mt-2 text-2xs text-muted">Runs four cost-guarded DataForSEO datasets and stores the evidence for reuse.</p></div>
        <div className="border-t border-border bg-workspace/50 p-5 lg:w-72 lg:border-l lg:border-t-0"><div className="flex items-center gap-2 text-xs font-semibold text-ink"><Swords className="h-4 w-4 text-purple" />Recent explorations</div><div className="mt-2 space-y-1">{recent.slice(0, 4).map((item) => <button key={item.id} onClick={() => { setTarget(item.targetHost); setResult(item); }} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-muted hover:bg-card hover:text-ink"><span className="truncate">{item.targetHost}</span><ArrowRight className="h-3 w-3" /></button>)}{!recent.length && <div className="text-2xs text-muted">No competitor has been explored yet.</div>}</div></div>
      </div>
    </Card>
    {result ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Organic keywords" value={result.overview.organicKeywords == null ? "—" : fullNumber(result.overview.organicKeywords)} accent />
        <KpiCard label="Estimated traffic" value={result.overview.organicTraffic == null ? "—" : fullNumber(Math.round(result.overview.organicTraffic))} />
        <KpiCard label="Traffic value" value={result.overview.estimatedTrafficCost == null ? "—" : `$${fullNumber(Math.round(result.overview.estimatedTrafficCost))}`} />
        <KpiCard label="Referring domains" value={result.backlinks.referringDomains == null ? "—" : fullNumber(result.backlinks.referringDomains)} />
        <KpiCard label="Domain rank" value={result.backlinks.rank == null ? "—" : String(result.backlinks.rank)} />
      </div>
      <Card><CardHeader title={result.targetHost} subtitle="Current organic footprint, strongest pages and link authority" action={<Building2 className="h-4 w-4 text-purple" />} /><div className="flex gap-1 border-b border-border px-4 py-2">{(["keywords", "pages"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === item ? "bg-purple text-white" : "text-muted hover:bg-workspace"}`}>{item === "keywords" ? `Ranking keywords (${result.keywords.length})` : `Top pages (${result.pages.length})`}</button>)}</div>{tab === "keywords" ? <DataTable<ExplorerResult["keywords"][number]> rows={result.keywords} columns={keywordColumns} searchPlaceholder="Search competitor keywords…" rowKey={(row) => `${row.keyword}:${row.url}`} /> : <DataTable<ExplorerResult["pages"][number]> rows={result.pages} columns={pageColumns} searchPlaceholder="Search pages…" rowKey={(row) => row.url} />}</Card>
    </> : <EmptyState icon={<Swords className="h-6 w-6" />} title="Choose a competitor to inspect" description="SEOcommand will capture its keyword footprint, strongest pages, paid visibility and backlink authority." />}
  </div>;
}
