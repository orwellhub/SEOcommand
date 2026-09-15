"use client";
import { TopicPlanner } from "@/components/research/topic-planner";
import { SerpStrategyWorkspace } from "@/components/research/serp-strategy-workspace";
import { CannibalisationWorkspace } from "@/components/reports/cannibalisation-workspace";
import { ReportTabs,useReportView } from "@/components/reports/report-layout";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers3, RefreshCw } from "lucide-react";
import { useResolvedDomain } from "@/components/shell/domain-context";
import { Button, Card, EmptyState, StatusBadge } from "@/components/ui/primitives";
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
  const [tab, setTab] = useReportView(["clusters","mapping","cannibalisation","phrases"] as const,"clusters");
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
    { key: "cluster", header: "Phrase group", sortValue: (row) => row.label, render: (row) => <div><div className="font-medium text-ink">{row.label}</div><div className="mt-0.5 text-2xs text-muted">{row.keywords.slice(0, 3).join(" · ")}{row.keywords.length > 3 ? ` +${row.keywords.length - 3}` : ""}</div></div> },
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
  function clusterFinding(row: Cluster): SiteFinding {
    return { key: `keyword-cluster:${row.id}`, title: `${row.targetUrl ? "Improve" : "Create"} coverage for ${row.label}`, module: "Keywords", executionType: row.targetUrl ? "refresh_brief" : "content_brief", priorityScore: row.opportunityScore, pageMode: row.targetUrl ? "existing_page" : "new_page", targetUrl: row.targetUrl, targetKeywords: row.keywords, evidenceLabel: `${fullNumber(row.totalVolume)} monthly searches · ${row.intent} intent · difficulty ${row.avgDifficulty}`, sourceUrl: `/keyword-strategy?site=${encodeURIComponent(domain.id)}&view=clusters`, sourceEvidence: { kind: "keyword_cluster", capturedOn: strategy?.capturedOn, cluster: row } };
  }
  function pageFinding(row: PageMap): SiteFinding {
    return { key: stableFindingKey("page-map", row.page), title: `Improve ${row.primaryQuery || "organic coverage"} on the mapped page`, module: "Keywords", executionType: "refresh_brief", priorityScore: Math.min(95, Math.max(45, Math.round(55 + Math.log10(Math.max(row.impressions, 1)) * 8))), pageMode: "existing_page", targetUrl: row.page, targetKeywords: row.queries, evidenceLabel: `${fullNumber(row.impressions)} impressions · ${fullNumber(row.clicks)} clicks · position ${row.averagePosition.toFixed(1)}`, sourceUrl: `/keyword-strategy?site=${encodeURIComponent(domain.id)}&view=mapping`, sourceEvidence: { kind: "keyword_page_map", capturedOn: strategy?.capturedOn, page: row } };
  }

  return <div className="space-y-4 pb-8">
    <header className="border-b border-border pb-4"><p className="mb-2 text-xs text-muted">SEO › Keyword Research</p><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">Keyword Strategy Builder: {domain.host}</h1>{tab!=="clusters"&&<Button size="sm" onClick={refresh} disabled={busy}><RefreshCw className={busy?"h-4 w-4 animate-spin":"h-4 w-4"}/>Refresh saved-data analysis</Button>}</div></header>
    <ReportTabs items={[{id:"clusters",label:"Strategy Builder"},{id:"mapping",label:"Page Ownership"},{id:"cannibalisation",label:"Cannibalisation"},{id:"phrases",label:"Phrase Planning"}]} value={tab} onChange={setTab}/>
    {error&&<p role="alert" className="rounded border border-critical/20 p-3 text-sm text-critical">{error}</p>}
    {tab==="clusters"&&<><SerpStrategyWorkspace/><details className="rounded border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Saved topic plans</summary><div className="mt-4"><TopicPlanner/></div></details></>}
    {tab==="cannibalisation"&&<Card><CannibalisationWorkspace key={domain.id} site={domain.id} candidates={strategy?.cannibalisation??[]}/></Card>}
    {(tab==="mapping"||tab==="phrases")&&(strategy?<Card className="p-4"><h2 className="mb-2 text-base font-semibold">{tab==="mapping"?"Page ownership":"Phrase-based content opportunities"}</h2><p className="mb-4 text-xs text-muted">{tab==="mapping"?"Page and query demand from the latest saved Search Console evidence.":"Groups based on recurring keyword phrases and intent. Use Strategy Builder for grouping by actual SERP overlap."} {strategy.capturedOn&&`Saved ${strategy.capturedOn}.`}</p>{tab==="mapping"?<DataTable rows={strategy.pageMap} columns={mapColumns} searchPlaceholder="Search pages or queries…" rowKey={row=>row.page} onRowClick={row=>setSelectedFinding(pageFinding(row))} exportName="keyword-page-ownership"/>:<DataTable rows={strategy.clusters} columns={clusterColumns} searchPlaceholder="Search phrase groups…" rowKey={row=>row.id} onRowClick={row=>setSelectedFinding(clusterFinding(row))} exportName="keyword-phrase-planning"/>}</Card>:<EmptyState icon={<Layers3 className="h-6 w-6"/>} title="Strategy evidence is not ready" description="Collect Search Console and keyword data, then refresh the saved-data analysis."/>)}
    <SiteFindingWorkDrawer finding={selectedFinding} siteSlug={domain.id} siteName={domain.name} onClose={()=>setSelectedFinding(null)}/>
  </div>;
}
