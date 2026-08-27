"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitMerge, Layers3, RefreshCw, Route, TriangleAlert } from "lucide-react";
import { useResolvedDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { fullNumber } from "@/lib/format";
import { SiteFindingWorkDrawer, type SiteFinding } from "@/components/workflow/site-finding-work-drawer";

interface Cluster { id: string; label: string; intent: string; keywords: string[]; totalVolume: number; avgDifficulty: number; bestPosition: number | null; targetUrl: string | null; opportunityScore: number }
interface PageMap { page: string; primaryQuery: string; queries: string[]; clicks: number; impressions: number; averagePosition: number }
interface Cannibalisation { query: string; pages: Array<{ page: string; clicks: number; impressions: number; position: number }>; totalImpressions: number; severity: "high" | "medium" | "low" }
interface Strategy { capturedOn?: string; clusters: Cluster[]; pageMap: PageMap[]; cannibalisation: Cannibalisation[]; summary: { clusters: number; mappedPages: number; unmappedClusters: number; cannibalisationIssues: number; highOpportunityClusters: number } }
function stableFindingKey(prefix: string, value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619); return `${prefix}:${(hash >>> 0).toString(36)}`; }

export default function KeywordStrategyPage() {
  const domain = useResolvedDomain();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [tab, setTab] = useState<"clusters" | "mapping" | "cannibalisation">("clusters");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<SiteFinding | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/keyword-strategy?site=${encodeURIComponent(domain.id)}`, { signal });
    const body = await response.json();
    if (response.ok) setStrategy(body.strategy);
    else setError(body.error ?? "Keyword strategy could not be loaded.");
  }, [domain.id]);
  useEffect(() => {
    const controller = new AbortController();
    setStrategy(null);
    setError(null);
    void load(controller.signal).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Keyword strategy could not be loaded.");
    });
    return () => controller.abort();
  }, [load]);

  const refresh = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/keyword-strategy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteSlug: domain.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Strategy refresh failed.");
      setStrategy(body.strategy);
    } catch (err) { setError(err instanceof Error ? err.message : "Strategy refresh failed."); }
    finally { setBusy(false); }
  };

  const clusterColumns = useMemo<Column<Cluster>[]>(() => [
    { key: "cluster", header: "Topic cluster", sortValue: (row) => row.label, render: (row) => <div><div className="font-medium text-ink">{row.label}</div><div className="mt-0.5 text-2xs text-muted">{row.keywords.slice(0, 3).join(" · ")}{row.keywords.length > 3 ? ` +${row.keywords.length - 3}` : ""}</div></div> },
    { key: "intent", header: "Intent", render: (row) => <StatusBadge label={row.intent} tone="neutral" /> },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.totalVolume, render: (row) => fullNumber(row.totalVolume) },
    { key: "difficulty", header: "Difficulty", align: "right", sortValue: (row) => row.avgDifficulty, render: (row) => row.avgDifficulty },
    { key: "position", header: "Best position", align: "right", sortValue: (row) => row.bestPosition ?? 999, render: (row) => row.bestPosition ?? "—" },
    { key: "score", header: "Opportunity", align: "right", sortValue: (row) => row.opportunityScore, render: (row) => <span className={row.opportunityScore >= 60 ? "font-semibold text-success" : "text-ink"}>{row.opportunityScore}</span> },
    { key: "target", header: "Target page", render: (row) => row.targetUrl ? <span className="block max-w-56 truncate text-muted" title={row.targetUrl}>{row.targetUrl.replace(/^https?:\/\//, "")}</span> : <StatusBadge label="Unmapped" tone="warning" /> },
  ], []);
  const mapColumns = useMemo<Column<PageMap>[]>(() => [
    { key: "page", header: "Page", sortValue: (row) => row.page, render: (row) => <div><div className="max-w-lg truncate font-medium text-ink">{row.page.replace(/^https?:\/\//, "")}</div><div className="mt-0.5 text-2xs text-muted">Primary: {row.primaryQuery}</div></div> },
    { key: "queries", header: "Queries", align: "right", sortValue: (row) => row.queries.length, render: (row) => row.queries.length },
    { key: "clicks", header: "Clicks", align: "right", sortValue: (row) => row.clicks, render: (row) => fullNumber(row.clicks) },
    { key: "impressions", header: "Impressions", align: "right", sortValue: (row) => row.impressions, render: (row) => fullNumber(row.impressions) },
    { key: "position", header: "Average position", align: "right", sortValue: (row) => row.averagePosition, render: (row) => row.averagePosition.toFixed(1) },
  ], []);
  const cannibalColumns = useMemo<Column<Cannibalisation>[]>(() => [
    { key: "query", header: "Competing query", sortValue: (row) => row.query, render: (row) => <span className="font-medium text-ink">{row.query}</span> },
    { key: "severity", header: "Priority", render: (row) => <StatusBadge label={row.severity} tone={row.severity === "high" ? "critical" : row.severity === "medium" ? "warning" : "neutral"} /> },
    { key: "pages", header: "Competing pages", sortValue: (row) => row.pages.length, render: (row) => <div className="max-w-xl space-y-1">{row.pages.slice(0, 3).map((page) => <div key={page.page} className="truncate text-xs text-muted">{page.position.toFixed(1)} · {page.page.replace(/^https?:\/\//, "")}</div>)}</div> },
    { key: "impressions", header: "Impressions", align: "right", sortValue: (row) => row.totalImpressions, render: (row) => fullNumber(row.totalImpressions) },
  ], []);

  function clusterFinding(row: Cluster): SiteFinding {
    return { key: `keyword-cluster:${row.id}`, title: `${row.targetUrl ? "Improve" : "Create"} coverage for ${row.label}`, module: "Keywords", executionType: row.targetUrl ? "refresh_brief" : "content_brief", priorityScore: row.opportunityScore, pageMode: row.targetUrl ? "existing_page" : "new_page", targetUrl: row.targetUrl, targetKeywords: row.keywords, evidenceLabel: `${fullNumber(row.totalVolume)} monthly searches · ${row.intent} intent · difficulty ${row.avgDifficulty}`, sourceUrl: `/keyword-strategy?site=${encodeURIComponent(domain.id)}&view=clusters`, sourceEvidence: { kind: "keyword_cluster", capturedOn: strategy?.capturedOn, cluster: row } };
  }
  function pageFinding(row: PageMap): SiteFinding {
    return { key: stableFindingKey("page-map", row.page), title: `Improve ${row.primaryQuery || "organic coverage"} on the mapped page`, module: "Keywords", executionType: "refresh_brief", priorityScore: Math.min(95, Math.max(45, Math.round(55 + Math.log10(Math.max(row.impressions, 1)) * 8))), pageMode: "existing_page", targetUrl: row.page, targetKeywords: row.queries, evidenceLabel: `${fullNumber(row.impressions)} impressions · ${fullNumber(row.clicks)} clicks · position ${row.averagePosition.toFixed(1)}`, sourceUrl: `/keyword-strategy?site=${encodeURIComponent(domain.id)}&view=mapping`, sourceEvidence: { kind: "keyword_page_map", capturedOn: strategy?.capturedOn, page: row } };
  }
  function cannibalisationFinding(row: Cannibalisation): SiteFinding {
    return { key: `cannibalisation:${row.query}`, title: `Resolve cannibalisation for ${row.query}`, module: "Keywords", executionType: "keyword_page_map", priorityScore: row.severity === "high" ? 90 : row.severity === "medium" ? 72 : 55, pageMode: "existing_page", targetUrl: row.pages[0]?.page, targetKeywords: [row.query], evidenceLabel: `${row.pages.length} competing pages · ${fullNumber(row.totalImpressions)} impressions`, sourceUrl: `/keyword-strategy?site=${encodeURIComponent(domain.id)}&view=cannibalisation`, sourceEvidence: { kind: "cannibalisation", capturedOn: strategy?.capturedOn, issue: row } };
  }

  return <div className="animate-in space-y-5">
    <PageHeader title="Keyword strategy" description={`Turn ${domain.name}'s keyword and Search Console evidence into intent clusters, page ownership and cannibalisation decisions.`} actions={<Button onClick={refresh} disabled={busy}><RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Rebuild strategy</Button>} />
    {error && <div role="alert" className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical">{error}</div>}
    {strategy ? <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Topic clusters" value={String(strategy.summary.clusters)} accent />
        <KpiCard label="Mapped pages" value={String(strategy.summary.mappedPages)} />
        <KpiCard label="High opportunity" value={String(strategy.summary.highOpportunityClusters)} />
        <KpiCard label="Unmapped clusters" value={String(strategy.summary.unmappedClusters)} />
        <KpiCard label="Cannibalisation risks" value={String(strategy.summary.cannibalisationIssues)} />
      </div>
      <Card><CardHeader title="Search architecture" subtitle="Select a finding to carry its evidence and page destination directly into approved work" action={<GitMerge className="h-4 w-4 text-purple" />} /><div className="flex gap-1 border-b border-border px-4 py-2">{[{ key: "clusters", label: "Topic clusters", icon: Layers3 }, { key: "mapping", label: "Page map", icon: Route }, { key: "cannibalisation", label: "Cannibalisation", icon: TriangleAlert }].map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setTab(key as typeof tab)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${tab === key ? "bg-purple text-white" : "text-muted hover:bg-workspace"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
        {tab === "clusters" && <DataTable<Cluster> rows={strategy.clusters} columns={clusterColumns} searchPlaceholder="Search clusters…" rowKey={(row) => row.id} onRowClick={(row) => setSelectedFinding(clusterFinding(row))} />}
        {tab === "mapping" && <DataTable<PageMap> rows={strategy.pageMap} columns={mapColumns} searchPlaceholder="Search pages or queries…" rowKey={(row) => row.page} onRowClick={(row) => setSelectedFinding(pageFinding(row))} />}
        {tab === "cannibalisation" && (strategy.cannibalisation.length ? <DataTable<Cannibalisation> rows={strategy.cannibalisation} columns={cannibalColumns} searchPlaceholder="Search competing queries…" rowKey={(row) => row.query} onRowClick={(row) => setSelectedFinding(cannibalisationFinding(row))} /> : <div className="p-4"><EmptyState title="No meaningful cannibalisation detected" description="SEOcommand only flags queries with multiple URLs and measurable impressions." /></div>)}
      </Card>
    </> : <EmptyState icon={<Layers3 className="h-6 w-6" />} title="Strategy evidence is not ready" description="Run the Search Console and keyword sync, then rebuild the strategy." />}
    <SiteFindingWorkDrawer finding={selectedFinding} siteSlug={domain.id} siteName={domain.name} onClose={() => setSelectedFinding(null)} />
  </div>;
}
