"use client";

import { ReportTabs, ReportMetric, UnavailableReport, useReportView } from "@/components/reports/report-layout";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Database, FileSearch, Globe2, History, Loader2, MapPin, Search, ShieldCheck, X } from "lucide-react";
import { useDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { compactNumber, currency } from "@/lib/format";
import { DEFAULT_MARKET } from "@/lib/markets";
import { cn } from "@/lib/cn";
import { DOMAIN_RESEARCH_ESTIMATE_USD } from "@/lib/research";
import { DomainAiSummary } from "@/components/reports/domain-ai-summary";
import { DomainOverviewPanels } from "@/components/reports/domain-overview-panels";
import { DomainGrowth } from "@/components/reports/domain-growth";
import { ResearchEvidencePanel } from "@/components/research/evidence-panel";
import { Drawer } from "@/components/ui/drawer";

type Summary = { organicKeywords?: number | null; organicTraffic?: number | null; paidKeywords?: number | null; paidTraffic?: number | null; estimatedTrafficCost?: number | null };
type KeywordRow = { keyword: string; position: number | null; volume: number | null; difficulty: number | null; intent: string | null; url: string | null; traffic: number | null };
type PageRow = { url: string; keywords: number | null; traffic: number | null; trafficCost: number | null };
type Backlinks = { rank: number | null; backlinks: number | null; referringDomains: number | null; spamScore: number | null };
type DomainEvidence = { id: string; projectId: string | null; kind: string; title: string; sourceValue: string; locationCode: number; languageCode: string; locationLabel: string; provider: string; providerCostUsd: number; summary: Summary; evidence?: { keywords?: KeywordRow[]; pages?: PageRow[]; backlinks?: Backlinks }; createdBy: string | null; capturedAt: string; updatedAt: string };
type DuplicateWarning = { severity: "none" | "info" | "warning"; summary: string; matches: Array<{ kind: string; label: string; url?: string }>; checkedAt: string };
type ResearchMapping = { id: string; evidenceId: string; siteSlug: string; title: string; notes: string | null; priorityScore: number; executionType: string; pageMode: string; targetUrl: string | null; plannedUrl: string | null; targetKeywords: string[]; ownerEmail: string | null; dueDate: string | null; duplicateWarning: DuplicateWarning; status: string; createdAt: string; updatedAt: string };
type SearchLocation = { code: number; name: string; parent: string | null; countryCode: string | null; type: string; language: string };

function metric(value: number | null | undefined) { return value == null ? "—" : compactNumber(value); }
function shortUrl(value: string) { try { const url = new URL(value); return `${url.pathname}${url.search}` || "/"; } catch { return value; } }
function freshness(iso: string) { const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)); return hours < 1 ? "Just collected" : hours < 24 ? `${hours}h old` : `${Math.floor(hours / 24)}d old`; }
function defaultDueDate() { const date = new Date(); date.setDate(date.getDate() + 14); return date.toISOString().slice(0, 10); }

const EXECUTION_OPTIONS = [
  ["content_brief", "Content brief"], ["refresh_brief", "Refresh brief"], ["keyword_page_map", "Keyword-to-page map"],
  ["tracked_keyword_group", "Tracked keyword group"], ["internal_link_task", "Internal-link task"], ["link_prospect_list", "Link prospects / outreach"], ["technical_task", "Technical task"],
] as const;

const KEYWORD_COLUMNS: Column<KeywordRow>[] = [
  { key: "keyword", header: "Keyword", width: "34%", sortValue: (row) => row.keyword, render: (row) => <div><div className="font-semibold text-ink">{row.keyword}</div><div className="mt-0.5 truncate text-[12px] text-muted">{row.url ? shortUrl(row.url) : "No ranking URL"}</div></div> },
  { key: "position", header: "Position", align: "right", sortValue: (row) => row.position ?? 999, render: (row) => row.position ?? "—" },
  { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume ?? -1, render: (row) => metric(row.volume) },
  { key: "traffic", header: "Est. traffic", align: "right", sortValue: (row) => row.traffic ?? -1, render: (row) => metric(row.traffic) },
  { key: "difficulty", header: "Difficulty", align: "right", sortValue: (row) => row.difficulty ?? -1, render: (row) => <StatusBadge label={row.difficulty == null ? "—" : String(Math.round(row.difficulty))} tone={row.difficulty == null ? "neutral" : row.difficulty < 35 ? "success" : row.difficulty < 65 ? "warning" : "critical"} /> },
  { key: "intent", header: "Intent", align: "center", sortValue: (row) => row.intent ?? "", render: (row) => <span className="text-xs capitalize text-muted">{row.intent ?? "Unknown"}</span> },
];

export default function DomainResearchPage() {
  const { sites, activeDomain } = useDomain();
  const [view, setView] = useReportView(["overview", "growth", "countries", "keywords", "pages", "history"] as const, "overview");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState<DomainEvidence[]>([]);
  const [active, setActive] = useState<DomainEvidence | null>(null);
  const [mappings, setMappings] = useState<ResearchMapping[]>([]);
  const [targetHost, setTargetHost] = useState("");
  const [location, setLocation] = useState<SearchLocation>({ code: DEFAULT_MARKET.code, name: DEFAULT_MARKET.label, parent: null, countryCode: "AE", type: "Country", language: DEFAULT_MARKET.language });
  const [locationQuery, setLocationQuery] = useState("");
  const [locations, setLocations] = useState<SearchLocation[]>([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [collectOpen, setCollectOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mappingSite, setMappingSite] = useState("");
  useEffect(() => { setMappingSite(activeDomain?.id ?? ""); }, [activeDomain?.id]);
  const [mappingTitle, setMappingTitle] = useState("");
  const [mappingNotes, setMappingNotes] = useState("");
  const [priorityScore, setPriorityScore] = useState(70);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappedNow, setMappedNow] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [executionType, setExecutionType] = useState<(typeof EXECUTION_OPTIONS)[number][0]>("content_brief");
  const [pageMode, setPageMode] = useState<"new_page" | "existing_page" | "site_wide">("new_page");
  const [targetUrl, setTargetUrl] = useState("");
  const [plannedUrl, setPlannedUrl] = useState("");
  const [targetKeywords, setTargetKeywords] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [mappingWarning, setMappingWarning] = useState<DuplicateWarning | null>(null);

  const loadMappings = useCallback(async (evidenceId: string) => {
    const response = await fetch(`/api/research-mappings?evidence=${encodeURIComponent(evidenceId)}`, { cache: "no-store" });
    const body = await response.json();
    setMappings(response.ok ? body.mappings ?? [] : []);
  }, []);

  const openEvidence = useCallback(async (id: string, updateUrl = true) => {
    setLoadingEvidence(true); setError(null); setMappedNow(false);
    try {
      const response = await fetch(`/api/domain-research?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.evidence) throw new Error(body.error ?? "Research evidence could not be opened.");
      const evidence = body.evidence as DomainEvidence;
      setActive(evidence); setTargetHost(evidence.sourceValue); setLocation({code:evidence.locationCode,name:evidence.locationLabel,parent:null,countryCode:null,type:"Country",language:evidence.languageCode}); setMappingTitle(`Investigate ${evidence.sourceValue} opportunity`); setTargetKeywords((evidence.evidence?.keywords ?? []).slice(0, 5).map((item) => item.keyword).join("\n"));
      await loadMappings(evidence.id);
      if (updateUrl) { const next = new URLSearchParams(window.location.search); next.set("evidence", evidence.id); router.replace(`/domain-research?${next}`); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Research evidence could not be opened."); }
    finally { setLoadingEvidence(false); }
  }, [loadMappings, router]);

  useEffect(() => {
    let live = true;
    fetch("/api/domain-research", { cache: "no-store" }).then((response) => response.json().then((body) => ({ response, body }))).then(({ response, body }) => { if (!response.ok) throw new Error("Saved research could not load. Refresh this page to retry."); if (live) setSaved(body.evidence ?? []); }).catch((reason) => { if (live) setError(reason.message); }).finally(() => { if (live) setLoadingSaved(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.user?.email) setOwnerEmail(body.user.email); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = searchParams.get("evidence");
    if (id) void openEvidence(id, false);
    else {
      const match = saved.find(row => row.sourceValue.replace(/^www\./, "") === activeDomain?.host.replace(/^www\./, ""));
      if (match) void openEvidence(match.id, false);
      else { setActive(null); setTargetHost(activeDomain?.host ?? ""); }
    }
  }, [openEvidence, searchParams, saved, activeDomain?.host]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!locationQuery.trim()) return setLocations([]);
      fetch(`/api/locations?q=${encodeURIComponent(locationQuery)}&limit=30`).then((response) => response.json()).then((body) => setLocations(body.locations ?? [])).catch(() => setLocations([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [locationQuery]);

  async function runResearch() {
    if (!targetHost.trim() || running) return;
    setRunning(true); setError(null); setMappedNow(false);
    try {
      const response = await fetch("/api/domain-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetHost: targetHost.trim(), locationCode: location.code, languageCode: location.language || "en", locationLabel: location.parent ? `${location.name}, ${location.parent}` : location.name }) });
      const body = await response.json();
      if (!response.ok || !body.evidence) throw new Error(body.error ?? "Domain research failed.");
      const evidence = body.evidence as DomainEvidence;
      setCollectOpen(false); setActive(evidence); setSaved((current) => [evidence, ...current.filter((item) => item.id !== evidence.id)]); setMappings([]); setMappingTitle(`Investigate ${evidence.sourceValue} opportunity`); setTargetKeywords((evidence.evidence?.keywords ?? []).slice(0, 5).map((item) => item.keyword).join("\n"));
      const next = new URLSearchParams(searchParams); next.set("evidence", evidence.id); router.replace(`/domain-research?${next}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Domain research failed."); }
    finally { setRunning(false); }
  }

  async function mapEvidence() {
    if (!active || !mappingSite || !mappingTitle.trim() || mappingBusy) return;
    setMappingBusy(true); setError(null);
    try {
      const response = await fetch("/api/research-mappings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceId: active.id, siteSlug: mappingSite, title: mappingTitle.trim(), notes: mappingNotes.trim() || null, priorityScore, executionType, pageMode, targetUrl: targetUrl.trim() || null, plannedUrl: plannedUrl.trim() || null, targetKeywords: targetKeywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean).slice(0, 30), ownerEmail: ownerEmail.trim(), dueDate }) });
      const body = await response.json();
      if (!response.ok || !body.mapping) throw new Error(body.error ?? "Evidence could not be mapped.");
      setMappings((current) => [body.mapping, ...current.filter((item) => item.id !== body.mapping.id)]); setMappedNow(true); setMappingWarning(body.mapping.duplicateWarning ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Evidence could not be mapped."); }
    finally { setMappingBusy(false); }
  }

  const evidence = active?.evidence;
  const keywords = evidence?.keywords ?? [];
  const backlinks = evidence?.backlinks;
  const strongestPages = useMemo(() => [...(active?.evidence?.pages ?? [])].sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0)).slice(0, view === "pages" ? undefined : 8), [active, view]);

  return <div id="analytics-report" className="animate-in space-y-4 [&_.report-metric]:py-3">
    <div className="flex flex-wrap items-center gap-2"><input aria-label="Domain to analyse" className="h-9 min-w-60 flex-1 rounded border border-border bg-card px-3 text-sm" value={targetHost} onChange={e=>setTargetHost(e.target.value)} placeholder="Enter a domain"/><span className="rounded border border-border px-3 py-2 text-xs">Root domain</span><Button variant="primary" onClick={()=>{const found=saved.find(row=>row.sourceValue===targetHost.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0]&&row.locationCode===location.code&&row.languageCode===location.language);if(found)void openEvidence(found.id);else setCollectOpen(true);}} disabled={!targetHost.trim()||loadingEvidence}>Analyze</Button></div>
    <PageHeader title={`Domain Overview${active ? `: ${active.sourceValue}` : ""}`} />

    <div className="flex flex-wrap items-center gap-3 text-xs"><span className="rounded border border-border bg-card px-3 py-2">{active?.locationLabel ?? location.name}</span><span>Desktop</span><span>{active ? new Date(active.capturedAt).toLocaleDateString() : "No collection date"}</span><span>USD</span><select aria-label="Saved domain investigation" className="h-8 max-w-72 rounded border border-border bg-card px-2" value={active?.id ?? ""} onChange={e=>void openEvidence(e.target.value)}><option value="" disabled>Choose saved investigation</option>{saved.map(r=><option key={r.id} value={r.id}>{r.sourceValue} · {r.locationLabel}</option>)}</select><Button size="sm" onClick={()=>setCollectOpen(true)}>Research a domain</Button><Button size="sm" disabled={!active} onClick={()=>{setMappedNow(false);setMappingWarning(null);setMappingOpen(true);}}>Create task{mappings.length?` · ${mappings.length} saved`:""}</Button><Button size="sm" className="ml-auto" onClick={()=>window.print()}>Export PDF</Button></div>
    <Drawer open={collectOpen} onClose={()=>setCollectOpen(false)} title="Research a domain" subtitle="Review the market and displayed price before paid collection">
    <Card className="relative overflow-visible">
      <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-lg bg-[#12B8C4]" />
      <div className="grid gap-3 p-4 pl-5 lg:grid-cols-[minmax(220px,1.3fr)_minmax(220px,0.8fr)_auto] lg:items-end">
        <label><span className="mb-1.5 block text-2xs font-bold uppercase tracking-[0.12em] text-muted">Domain or website</span><div className="relative"><Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0E98A3]" /><input value={targetHost} onChange={(event) => setTargetHost(event.target.value)} placeholder="e.g. competitor.com" className="h-11 w-full rounded-md border border-border bg-card pl-10 pr-3 text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-[#12B8C4]" /></div></label>
        <div className="relative"><span className="mb-1.5 block text-2xs font-bold uppercase tracking-[0.12em] text-muted">Search market</span><button type="button" onClick={() => setLocationOpen((value) => !value)} className="flex h-11 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm font-semibold text-ink"><MapPin className="h-4 w-4 text-purple" /><span className="min-w-0 flex-1 truncate">{location.parent ? `${location.name}, ${location.parent}` : location.name}</span></button>{locationOpen && <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-pop"><div className="flex items-center gap-2 border-b border-border px-3 py-2"><Search className="h-4 w-4 text-muted" /><input autoFocus value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Country, city or region" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /><button onClick={() => setLocationOpen(false)}><X className="h-4 w-4 text-muted" /></button></div><div className="max-h-64 overflow-y-auto p-1.5">{locations.map((item) => <button key={item.code} onClick={() => { setLocation(item); setLocationOpen(false); setLocationQuery(""); }} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-workspace"><MapPin className="h-4 w-4 text-[#12B8C4]" /><span><span className="block text-sm font-semibold text-ink">{item.name}</span><span className="block text-[12px] text-muted">{item.parent ?? item.countryCode ?? "Worldwide"} · {item.type}</span></span></button>)}{locationQuery && !locations.length && <div className="p-4 text-center text-xs text-muted">Searching worldwide locations…</div>}</div></div>}</div>
        <div><Button variant="primary" className="h-11 w-full px-5" onClick={() => void runResearch()} disabled={!targetHost.trim() || running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Run live research</Button><div className="mt-1.5 text-center text-[12px] text-muted">Estimated provider cost ≤ {currency(DOMAIN_RESEARCH_ESTIMATE_USD)}</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-workspace/45 px-7 py-3 text-2xs text-muted"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Budget checked before collection</span><span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-purple" /> Results saved as reusable evidence</span><span className="ml-auto">Opening saved evidence makes no provider call</span></div>
    </Card></Drawer>

    {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-critical/25 bg-critical/5 px-4 py-3 text-sm text-critical"><X className="h-4 w-4" />{error}</div>}

    <ReportTabs items={[{id:"overview",label:"Overview"},{id:"growth",label:"Growth report"},{id:"countries",label:"Compare by countries"},{id:"keywords",label:"Organic rankings"},{id:"pages",label:"Top pages"},{id:"history",label:"Saved investigations"}]} value={view} onChange={setView} label="Domain reports" />
    <div className="space-y-4">
      {view === "history" && <details open className="rounded-md border border-border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Saved investigations · {saved.length}</summary><Card className="h-fit overflow-hidden border-0 shadow-none"><div className="border-b border-border px-4 py-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-purple" /><h2 className="text-sm font-bold text-ink">Saved investigations</h2></div><p className="mt-1 text-[12px] text-muted">Stored evidence, newest first</p></div>{loadingSaved ? <div className="space-y-2 p-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : saved.length ? <div className="max-h-[620px] divide-y divide-border overflow-y-auto">{saved.map((item) => <button key={item.id} onClick={() => void openEvidence(item.id)} className={cn("w-full px-4 py-3 text-left hover:bg-workspace", active?.id === item.id && "bg-[#12B8C4]/[0.07]")}><div className="truncate text-sm font-bold text-ink">{item.sourceValue}</div><div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-muted"><span className="truncate">{item.locationLabel}</span><span className="shrink-0">{freshness(item.capturedAt)}</span></div></button>)}</div> : <div className="p-4"><EmptyState title="No domain evidence" description="Run the first investigation above. It will be stored automatically." icon={<History className="h-5 w-5" />} /></div>}</Card></details>}

      {view === "history" ? null : view === "countries" ? <ResearchEvidencePanel features={["countries"]} targetDomain={active?.sourceValue ?? targetHost}/> : view === "growth" && activeDomain ? <DomainGrowth site={activeDomain.id} target={active?.sourceValue ?? targetHost} market={active?.locationCode ?? location.code} language={active?.languageCode ?? location.language} marketLabel={active?.locationLabel ?? location.name}/> : loadingEvidence ? <div className="space-y-4"><Skeleton className="h-24" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-96" /></div> : active ? <div className="space-y-5">

        {view === "overview" && <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <DomainAiSummary host={active.sourceValue}/>
          <Card><div className="border-b border-border px-3 py-2 text-sm font-bold">SEO</div><div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4"><ReportMetric compact label="Authority Score" note="Semrush proprietary metric"/><ReportMetric compact label="Organic traffic" value={active.summary.organicTraffic == null ? null : metric(active.summary.organicTraffic)} note="Provider estimate" /><ReportMetric compact label="Paid traffic" value={active.summary.paidTraffic == null ? null : metric(active.summary.paidTraffic)} note="Provider estimate" /><ReportMetric compact label="Referring domains" value={backlinks?.referringDomains == null ? null : metric(backlinks.referringDomains)} /></div><div className="grid grid-cols-2 divide-x divide-border border-t lg:grid-cols-4"><ReportMetric compact label="Traffic share"/><ReportMetric compact label="Organic keywords" value={active.summary.organicKeywords == null ? null : metric(active.summary.organicKeywords)} /><ReportMetric compact label="Paid keywords" value={active.summary.paidKeywords == null ? null : metric(active.summary.paidKeywords)} /><ReportMetric compact label="Backlinks" value={backlinks?.backlinks == null ? null : metric(backlinks.backlinks)} /></div></Card>
        </div>}
        {view === "overview" && activeDomain && <DomainGrowth site={activeDomain.id} target={active.sourceValue} market={active.locationCode} language={active.languageCode} marketLabel={active.locationLabel}/>}

        {view === "overview" && <DomainOverviewPanels site={activeDomain?.id} host={active.sourceValue} market={active.locationCode} language={active.languageCode} keywords={keywords} pages={evidence?.pages??[]} backlinks={backlinks} onView={setView}/>}
        {view === "keywords" && <Card className="p-4"><h2 className="mb-3 text-base font-semibold">Organic Search Positions</h2><DataTable rows={keywords} columns={KEYWORD_COLUMNS} rowKey={row=>`${row.keyword}:${row.url}`} searchKeys={row=>`${row.keyword} ${row.intent??""} ${row.url??""}`} searchPlaceholder="Filter keyword evidence…" exportName={`${active.sourceValue}-domain-keywords`} pageSize={50}/></Card>}
        {view === "pages" && <Card className="p-4"><h2 className="mb-3 text-base font-semibold">Top Organic Pages</h2><DataTable rows={strongestPages} columns={[{key:"url",header:"URL",sortValue:row=>row.url,render:row=><a href={row.url} target="_blank" rel="noreferrer" className="block max-w-xl truncate text-purple">{row.url}</a>},{key:"traffic",header:"Traffic est.",sortValue:row=>row.traffic??-1,render:row=>metric(row.traffic)},{key:"keywords",header:"Keywords",sortValue:row=>row.keywords??-1,render:row=>metric(row.keywords)},{key:"cost",header:"Traffic cost (USD)",sortValue:row=>row.trafficCost??-1,render:row=>row.trafficCost==null?"—":currency(row.trafficCost)}]} rowKey={row=>row.url} searchKeys={row=>row.url} exportName={`${active.sourceValue}-organic-pages`} pageSize={50}/></Card>}
        <p className="text-[11px] text-muted">DataForSEO · {active.locationLabel} / {active.languageCode} · collected {new Date(active.capturedAt).toLocaleString()}. Traffic figures are estimates; keyword and page tables are collected samples.</p>
      </div> : <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1fr_2fr]"><DomainAiSummary host={targetHost||activeDomain?.host||""}/><Card><div className="border-b border-border px-3 py-2 text-sm font-bold">SEO</div><div className="grid grid-cols-2 lg:grid-cols-4">{["Authority Score","Organic traffic","Paid traffic","Referring domains","Traffic share","Organic keywords","Paid keywords","Backlinks"].map(label=><ReportMetric compact key={label} label={label}/>)}</div></Card></div>{activeDomain ? <DomainGrowth site={activeDomain.id} target={targetHost||activeDomain.host} market={location.code} language={location.language} marketLabel={location.name}/> : <UnavailableReport title="Domain overview" description="Choose a saved investigation or research a domain. A website workspace is needed for historical and country research." metrics={["Organic traffic","Organic keywords","Referring domains","Backlinks"]}/>}</div>}
    </div>

    {active && <Drawer open={mappingOpen} onClose={() => setMappingOpen(false)} title="Convert opportunity" subtitle={`${active.sourceValue} · ${active.locationLabel}`} width="max-w-xl" footer={<div className="flex items-center justify-between gap-3"><span className="text-[12px] text-muted">Mapping saves a proposal; it does not start execution.</span><div className="flex gap-2"><Button onClick={() => setMappingOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => void mapEvidence()} disabled={!mappingSite || !mappingTitle.trim() || !ownerEmail.trim() || !dueDate || (pageMode === "existing_page" && !targetUrl.trim()) || (pageMode === "new_page" && !plannedUrl.trim()) || mappingBusy}>{mappingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />} Save for approval</Button></div></div>}>
      <div className="space-y-5">
        {mappings.length>0&&<details><summary className="text-sm font-semibold">Saved tasks · {mappings.length}</summary>{mappings.map(mapping=><div key={mapping.id} className="flex justify-between border-b border-border py-2 text-xs"><span>{mapping.title}</span><StatusBadge label={mapping.status}/></div>)}</details>}
        <div className="rounded-lg border border-[#12B8C4]/25 bg-[#12B8C4]/[0.06] p-4"><div className="text-2xs font-bold uppercase tracking-[0.12em] text-[#0E98A3]">Evidence carried forward</div><div className="mt-2 text-sm font-bold text-ink">{active.title}</div><div className="mt-1 text-xs text-muted">{metric(active.summary.organicKeywords)} keywords · {metric(active.summary.organicTraffic)} estimated traffic · captured {freshness(active.capturedAt)}</div></div>

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">1 · Destination and output</div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-ink">Website</span><select value={mappingSite} onChange={(event) => setMappingSite(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink"><option value="">Choose a website</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label><span className="mb-1 block text-xs font-semibold text-ink">Execution type</span><select value={executionType} onChange={(event) => setExecutionType(event.target.value as typeof executionType)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink">{EXECUTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Opportunity title</span><input value={mappingTitle} onChange={(event) => setMappingTitle(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label></section>

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">2 · Page plan</div><div className="grid grid-cols-3 gap-2">{([['new_page','New page'],['existing_page','Existing page'],['site_wide','Site-wide']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setPageMode(value)} className={cn("rounded-md border px-2 py-2 text-xs font-semibold", pageMode === value ? "border-purple bg-purple/10 text-purple" : "border-border text-muted hover:text-ink")}>{label}</button>)}</div>{pageMode === "existing_page" && <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Target URL</span><input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://site.com/existing-page" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label>}{pageMode === "new_page" && <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Planned URL or path</span><input value={plannedUrl} onChange={(event) => setPlannedUrl(event.target.value)} placeholder="/guides/new-opportunity" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label>}<label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Target keywords <span className="font-normal text-muted">one per line</span></span><textarea value={targetKeywords} onChange={(event) => setTargetKeywords(event.target.value)} rows={4} className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-purple" /></label></section>

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">3 · Ownership and value</div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-ink">Owner email</span><input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label><label><span className="mb-1 block text-xs font-semibold text-ink">Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label></div><label className="mt-3 block"><span className="mb-1 flex items-center justify-between text-xs font-semibold text-ink"><span>Priority</span><span className="text-purple tnum">{priorityScore}/100</span></span><input type="range" min="0" max="100" step="5" value={priorityScore} onChange={(event) => setPriorityScore(Number(event.target.value))} className="w-full accent-purple" /></label><label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Qualification notes</span><textarea value={mappingNotes} onChange={(event) => setMappingNotes(event.target.value)} placeholder="Why this matters, expected value and recommended next action" rows={4} className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" /></label></section>

        {mappedNow && <div className="rounded-lg border border-success/25 bg-success/5 p-4"><div className="flex items-center gap-2 text-sm font-bold text-success"><CheckCircle2 className="h-4 w-4" />Opportunity mapped and awaiting approval</div><Link href="/action-centre" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-purple">Review in Action Centre <ArrowRight className="h-3.5 w-3.5" /></Link></div>}
        {mappingWarning && <div className={cn("rounded-lg border p-4", mappingWarning.severity === "warning" ? "border-warning/30 bg-warning/5" : "border-[#12B8C4]/25 bg-[#12B8C4]/[0.05]")}><div className="flex items-start gap-2"><AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", mappingWarning.severity === "warning" ? "text-warning" : "text-[#0E98A3]")} /><div><div className="text-xs font-bold text-ink">Duplicate and cannibalisation check</div><p className="mt-1 text-xs leading-5 text-muted">{mappingWarning.summary}</p></div></div>{mappingWarning.matches.length > 0 && <div className="mt-3 space-y-1">{mappingWarning.matches.map((match, index) => <div key={`${match.kind}:${match.label}:${index}`} className="rounded bg-card px-2.5 py-2 text-[12px] text-muted"><span className="font-bold uppercase text-ink">{match.kind}</span> · {match.label}{match.url ? ` · ${shortUrl(match.url)}` : ""}</div>)}</div>}</div>}
      </div>
    </Drawer>}
  </div>;
}
