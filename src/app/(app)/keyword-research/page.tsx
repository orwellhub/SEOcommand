"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronRight, Download, FolderKanban, Globe2, History, Layers3, Loader2, MapPin, Plus, Radar, ScanSearch, Search, Sparkles, Target, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Sparkline } from "@/components/charts/sparkline";
import { SavedScans, type SavedScan } from "@/components/keyword-research/saved-scans";
import { useDomain } from "@/components/shell/domain-context";
import { compactNumber, currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DEFAULT_MARKET } from "@/lib/markets";
import type { KeywordResearchResult, KeywordResearchRow } from "@/lib/types";

type View = "discover" | "projects" | "saved" | "tracking";
type SearchLocation = { code: number; name: string; parent: string | null; countryCode: string | null; type: string; language: string };
type Project = { id: string; siteSlug: string | null; name: string; description: string | null; status: string; tags: string[]; updatedAt: string };
type Campaign = { id: string; name: string; defaultCadence: string; searchEngine: string; updatedAt: string };
type TrackedKeyword = { id: string; keyword: string; locationCode: number; device: string; cadence: string; campaignId: string | null; active: boolean };
type ResearchRow = KeywordResearchRow & { marketCode: number; marketLabel: string; languageCode: string };

const DEPTHS = [50, 100, 250, 500];
const SOURCE_TYPES = [
  { id: "seed", label: "Seed keyword", hint: "Expand a topic into related demand" },
  { id: "domain", label: "Website or page", hint: "Use a domain or URL as the research anchor" },
  { id: "competitor", label: "Competitor", hint: "Explore a competing brand or domain" },
  { id: "questions", label: "Questions", hint: "Find informational and AI-search opportunities" },
];
const INTENT_COLORS: Record<string, string> = { informational: "#335CFF", commercial: "#7137F5", transactional: "#16A879", navigational: "#FF6B5E", unknown: "#9AA5B5" };

function fmtVolume(value: number | null) { return value == null ? "—" : compactNumber(value); }
function fmtCpc(value: number | null) { return value == null ? "—" : currency(value); }
function difficultyTone(value: number | null): "success" | "warning" | "critical" | "neutral" { return value == null ? "neutral" : value < 30 ? "success" : value < 60 ? "warning" : "critical"; }
function mean(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

export default function KeywordResearchPage() {
  const { activeDomain, sites } = useDomain();
  const site = activeDomain ?? sites[0] ?? null;
  const [view, setView] = useState<View>("discover");
  const [sourceType, setSourceType] = useState("seed");
  const [seed, setSeed] = useState("");
  const [depth, setDepth] = useState(100);
  const [locations, setLocations] = useState<SearchLocation[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<SearchLocation[]>([{ code: DEFAULT_MARKET.code, name: DEFAULT_MARKET.label, parent: null, countryCode: "AE", type: "Country", language: DEFAULT_MARKET.language }]);
  const [results, setResults] = useState<KeywordResearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [scans, setScans] = useState<SavedScan[]>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [busyScanId, setBusyScanId] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [newProject, setNewProject] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tracked, setTracked] = useState<TrackedKeyword[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("weekly");
  const [tracking, setTracking] = useState(false);

  const rows = useMemo<ResearchRow[]>(() => results.flatMap((result) => result.rows.map((row) => ({ ...row, marketCode: result.locationCode, marketLabel: result.locationLabel, languageCode: result.languageCode }))), [results]);
  const keyFor = (row: ResearchRow) => `${row.marketCode}:${row.keyword}`;
  const loadWorkspace = useCallback(async () => {
    const siteQuery = site ? `?site=${encodeURIComponent(site.id)}` : "";
    try {
      const [scanResponse, projectResponse, trackingResponse] = await Promise.all([
        fetch(`/api/keyword-research/scans${siteQuery}`, { cache: "no-store" }),
        fetch(`/api/keyword-projects${siteQuery}`, { cache: "no-store" }),
        site ? fetch(`/api/rank-tracking?site=${encodeURIComponent(site.id)}`, { cache: "no-store" }) : null,
      ]);
      const [scanBody, projectBody, trackingBody] = await Promise.all([scanResponse.json(), projectResponse.json(), trackingResponse?.json()]);
      setScans(scanBody.ok ? scanBody.scans ?? [] : []);
      setProjects(projectBody.ok ? projectBody.projects ?? [] : []);
      setCampaigns(trackingBody?.ok ? trackingBody.campaigns ?? [] : []);
      setTracked(trackingBody?.ok ? trackingBody.keywords ?? [] : []);
    } catch { setScans([]); }
    finally { setScansLoading(false); }
  }, [site]);
  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(locationQuery)}&limit=40`).catch(() => null);
      if (!response?.ok) return;
      const body = await response.json() as { locations?: SearchLocation[] };
      setLocations(body.locations ?? []);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [locationQuery]);

  const kpis = useMemo(() => {
    const volumes = rows.map((row) => row.volume).filter((value): value is number => value != null);
    const difficulty = rows.map((row) => row.difficulty).filter((value): value is number => value != null);
    const cpc = rows.map((row) => row.cpc).filter((value): value is number => value != null);
    return { count: rows.length, totalVolume: volumes.reduce((sum, value) => sum + value, 0), avgDifficulty: Math.round(mean(difficulty)), avgCpc: mean(cpc), opportunities: rows.filter((row) => (row.volume ?? 0) >= 100 && (row.difficulty ?? 100) < 35).length };
  }, [rows]);
  const intents = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.intent ?? "unknown", (counts.get(row.intent ?? "unknown") ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  async function saveResult(result: KeywordResearchResult) {
    const response = await fetch("/api/keyword-research/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: projectId || null, siteSlug: site?.id ?? null, label: `${seed} · ${result.locationLabel}`, sourceType, sourceValue: seed, seed: result.seed, locationCode: result.locationCode, languageCode: result.languageCode, locationLabel: result.locationLabel, rows: result.rows }) }).catch(() => null);
    if (response?.ok) { const body = await response.json(); if (body.scan?.id) setActiveScanId(body.scan.id); }
  }
  async function runResearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!seed.trim() || !selectedLocations.length || loading) return;
    setLoading(true); setError(null); setResults([]); setSelectedRows(new Set()); setReplayed(false);
    try {
      const collected: KeywordResearchResult[] = [];
      for (const location of selectedLocations) {
        const params = new URLSearchParams({ seed: seed.trim(), sourceType, location: String(location.code), locationLabel: location.parent ? `${location.name}, ${location.parent}` : location.name, language: location.language || "en", limit: String(depth) });
        if (site?.id) params.set("site", site.id);
        const response = await fetch(`/api/keyword-research?${params}`); const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message ?? `Research failed for ${location.name}.`);
        const result = body.result as KeywordResearchResult; collected.push(result); await saveResult(result);
      }
      setResults(collected); await loadWorkspace();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Keyword research failed."); }
    finally { setLoading(false); }
  }
  async function openScan(scan: SavedScan) {
    setBusyScanId(scan.id); setError(null);
    try {
      const response = await fetch(`/api/keyword-research/scans/${scan.id}`); const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Could not open that saved search.");
      setResults([body.result as KeywordResearchResult]); setActiveScanId(scan.id); setSeed(scan.seed); setReplayed(true); setView("discover");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open that saved search."); }
    finally { setBusyScanId(null); }
  }
  async function deleteScan(scan: SavedScan) {
    if (!window.confirm(`Delete the saved search “${scan.seed}”?`)) return;
    setBusyScanId(scan.id); const response = await fetch(`/api/keyword-research/scans/${scan.id}`, { method: "DELETE" }).catch(() => null); setBusyScanId(null);
    if (!response?.ok) setError("Could not delete that saved search."); else await loadWorkspace();
  }
  async function createProject() {
    if (!newProject.trim()) return;
    const response = await fetch("/api/keyword-projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteSlug: site?.id ?? null, name: newProject.trim() }) });
    const body = await response.json(); if (!response.ok) { setError(body.error ?? "Could not create the project."); return; }
    setNewProject(""); setProjectId(body.project.id); await loadWorkspace();
  }
  async function addTracking() {
    const chosen = rows.filter((row) => selectedRows.has(keyFor(row)));
    if (!site || !chosen.length || tracking) return;
    setTracking(true); setError(null);
    try {
      let campaignId: string | null = null;
      for (const locationCode of [...new Set(chosen.map((row) => row.marketCode))]) {
        const marketRows = chosen.filter((row) => row.marketCode === locationCode);
        const response: Response = await fetch("/api/rank-tracking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteSlug: site.id, campaignId, campaignName: campaignName.trim() || `${seed} tracking`, cadence, searchEngine: "google", locationCode, languageCode: marketRows[0]?.languageCode ?? "en", device: "desktop", keywords: marketRows.map((row) => ({ keyword: row.keyword })) }) });
        const body: { error?: string; campaignId?: string; campaign?: { id?: string } } = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not create tracking."); campaignId = body.campaignId ?? body.campaign?.id ?? campaignId;
      }
      setSelectedRows(new Set()); setCampaignName(""); setView("tracking"); await loadWorkspace();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create tracking."); }
    finally { setTracking(false); }
  }
  async function downloadExcel() {
    if (!rows.length || exporting) return; setExporting(true);
    try {
      const response = await fetch("/api/keyword-research/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: seed || "keyword-research", locationLabel: selectedLocations.map((item) => item.name).join(", "), fetchedAt: new Date().toISOString().slice(0, 10), rows }) });
      if (!response.ok) throw new Error(); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `keyword-research-${Date.now()}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
    } catch { setError("Excel export failed."); } finally { setExporting(false); }
  }

  const columns: Column<ResearchRow>[] = [
    { key: "select", header: "", width: "38px", render: (row) => <input type="checkbox" aria-label={`Select ${row.keyword}`} checked={selectedRows.has(keyFor(row))} onChange={() => setSelectedRows((current) => { const next = new Set(current); const key = keyFor(row); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="h-4 w-4 accent-purple" /> },
    { key: "keyword", header: "Keyword", width: "30%", sortValue: (row) => row.keyword, render: (row) => <div><div className="font-semibold text-ink">{row.keyword}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted"><MapPin className="h-2.5 w-2.5" />{row.marketLabel}</div></div> },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume ?? -1, render: (row) => <span className="font-semibold tnum">{fmtVolume(row.volume)}</span> },
    { key: "difficulty", header: "Difficulty", align: "right", sortValue: (row) => row.difficulty ?? -1, render: (row) => <StatusBadge label={row.difficulty == null ? "—" : String(Math.round(row.difficulty))} tone={difficultyTone(row.difficulty)} /> },
    { key: "intent", header: "Intent", align: "center", sortValue: (row) => row.intent ?? "", render: (row) => <span className="inline-flex items-center gap-1.5 text-xs capitalize text-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ background: INTENT_COLORS[row.intent ?? "unknown"] }} />{row.intent ?? "Unknown"}</span> },
    { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc ?? -1, render: (row) => <span className="tnum">{fmtCpc(row.cpc)}</span> },
    { key: "trend", header: "Trend", align: "right", render: (row) => row.trend.length > 1 ? <Sparkline data={row.trend} className="ml-auto h-7 w-20" /> : <span>—</span> },
  ];

  return <div>
    <PageHeader title="Keyword Strategy" description="Discover worldwide demand, organise repeatable research and turn the best opportunities into monitored campaigns." actions={<Button variant="secondary" onClick={() => void downloadExcel()} disabled={!rows.length || exporting}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export</Button>} />
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">{([ ["discover","Discover",Search], ["projects","Projects",FolderKanban], ["saved","Saved searches",History], ["tracking","Tracking",Radar] ] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setView(id)} className={cn("flex min-w-fit flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold transition-colors", view === id ? "bg-ink text-white shadow-sm" : "text-muted hover:bg-workspace hover:text-ink")}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
    {error && <div className="mb-5 flex items-center gap-2 rounded-lg border border-critical/20 bg-critical/5 px-4 py-3 text-sm text-critical"><X className="h-4 w-4" />{error}</div>}
    {view === "discover" && <DiscoverView sourceType={sourceType} setSourceType={setSourceType} seed={seed} setSeed={setSeed} depth={depth} setDepth={setDepth} selectedLocations={selectedLocations} setSelectedLocations={setSelectedLocations} locationOpen={locationOpen} setLocationOpen={setLocationOpen} locationQuery={locationQuery} setLocationQuery={setLocationQuery} locations={locations} projects={projects} projectId={projectId} setProjectId={setProjectId} loading={loading} runResearch={runResearch} rows={rows} kpis={kpis} intents={intents} columns={columns} selectedRows={selectedRows} tracking={tracking} addTracking={addTracking} campaignName={campaignName} setCampaignName={setCampaignName} cadence={cadence} setCadence={setCadence} replayed={replayed} />}
    {view === "projects" && <ProjectsView projects={projects} newProject={newProject} setNewProject={setNewProject} createProject={createProject} open={(id) => { setProjectId(id); setView("discover"); }} />}
    {view === "saved" && <SavedScans scans={scans} loading={scansLoading} activeId={activeScanId} busyId={busyScanId} onOpen={openScan} onDelete={deleteScan} />}
    {view === "tracking" && <TrackingView campaigns={campaigns} tracked={tracked} siteName={site?.name ?? "website"} />}
  </div>;
}

type DiscoverProps = {
  sourceType: string; setSourceType: (value: string) => void; seed: string; setSeed: (value: string) => void; depth: number; setDepth: (value: number) => void;
  selectedLocations: SearchLocation[]; setSelectedLocations: React.Dispatch<React.SetStateAction<SearchLocation[]>>; locationOpen: boolean; setLocationOpen: (value: boolean) => void; locationQuery: string; setLocationQuery: (value: string) => void; locations: SearchLocation[];
  projects: Project[]; projectId: string; setProjectId: (value: string) => void; loading: boolean; runResearch: () => Promise<void>; rows: ResearchRow[];
  kpis: { count: number; totalVolume: number; avgDifficulty: number; avgCpc: number; opportunities: number }; intents: [string, number][]; columns: Column<ResearchRow>[]; selectedRows: Set<string>; tracking: boolean; addTracking: () => Promise<void>; campaignName: string; setCampaignName: (value: string) => void; cadence: "daily" | "weekly"; setCadence: (value: "daily" | "weekly") => void; replayed: boolean;
};

function DiscoverView(props: DiscoverProps) {
  return <>
    <Card className="mb-5 overflow-visible"><div className="grid gap-5 p-5 xl:grid-cols-[220px_minmax(260px,1fr)_minmax(300px,1.2fr)_120px_auto] xl:items-end">
      <label><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">Research source</span><select value={props.sourceType} onChange={(event) => props.setSourceType(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple">{SOURCE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
      <label><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">{SOURCE_TYPES.find((type) => type.id === props.sourceType)?.label}</span><input value={props.seed} onChange={(event) => props.setSeed(event.target.value)} placeholder={props.sourceType === "seed" ? "e.g. UAE mortgage rates" : "Enter a website, competitor or topic"} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" /><span className="mt-1 block text-[10px] text-muted">{SOURCE_TYPES.find((type) => type.id === props.sourceType)?.hint}</span></label>
      <div className="relative"><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">Markets · up to 5</span><button type="button" onClick={() => props.setLocationOpen(!props.locationOpen)} className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-left">{props.selectedLocations.map((location) => <span key={location.code} className="inline-flex items-center gap-1 rounded-full bg-purple/10 px-2 py-1 text-[11px] font-semibold text-purple">{location.name}<span onClick={(event) => { event.stopPropagation(); if (props.selectedLocations.length > 1) props.setSelectedLocations((current) => current.filter((item) => item.code !== location.code)); }}><X className="h-3 w-3" /></span></span>)}<Plus className="ml-auto h-3.5 w-3.5 text-muted" /></button>{props.locationOpen && <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-pop"><div className="flex items-center gap-2 border-b border-border px-3 py-2"><Globe2 className="h-4 w-4 text-purple" /><input autoFocus value={props.locationQuery} onChange={(event) => props.setLocationQuery(event.target.value)} placeholder="Search any country, city or region" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /></div><div className="max-h-64 overflow-y-auto p-1.5">{props.locations.map((location) => <button key={location.code} disabled={props.selectedLocations.some((item) => item.code === location.code) || props.selectedLocations.length >= 5} onClick={() => { props.setSelectedLocations((current) => [...current, location]); props.setLocationOpen(false); props.setLocationQuery(""); }} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-workspace disabled:opacity-40"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#12B8C4]/10 text-[#0E98A3]"><MapPin className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{location.name}</span><span className="block truncate text-[10px] text-muted">{location.parent ?? location.countryCode ?? "Worldwide"} · {location.type}</span></span></button>)}</div></div>}</div>
      <label><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">Depth</span><select value={props.depth} onChange={(event) => props.setDepth(Number(event.target.value))} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple">{DEPTHS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <Button variant="primary" className="h-10" onClick={() => void props.runResearch()} disabled={!props.seed.trim() || !props.selectedLocations.length || props.loading}>{props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} Research</Button>
    </div><div className="flex flex-wrap items-center gap-2 border-t border-border bg-workspace/45 px-5 py-3"><FolderKanban className="h-3.5 w-3.5 text-muted" /><span className="text-xs text-muted">Save into</span><select value={props.projectId} onChange={(event) => props.setProjectId(event.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs font-semibold text-ink"><option value="">Unfiled research</option>{props.projects.filter((project) => project.status === "active").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><span className="ml-auto text-[10px] text-muted">Each market is stored separately, so reopening results is free.</span></div></Card>
    {props.loading ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-80" /></div> : props.rows.length ? <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[["Keyword-market pairs",compactNumber(props.kpis.count),`${props.selectedLocations.length} markets`,"#335CFF"],["Total demand",compactNumber(props.kpis.totalVolume),"Monthly searches","#12B8C4"],["Average difficulty",String(props.kpis.avgDifficulty),"0–100 scale","#7137F5"],["Average CPC",fmtCpc(props.kpis.avgCpc),"Commercial signal","#FF6B5E"],["Quick wins",compactNumber(props.kpis.opportunities),"Volume ≥100 · KD <35","#16A879"]].map(([label,value,hint,color]) => <Card key={label} className="relative overflow-hidden p-4"><span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} /><div className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</div><div className="mt-2 text-2xl font-black tracking-tight text-ink tnum">{value}</div><div className="mt-1 text-[10px] text-muted">{hint}</div></Card>)}</div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><Card className="overflow-hidden p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-ink">Opportunity table</h2><p className="mt-0.5 text-2xs text-muted">Select keywords to move from research into daily or weekly tracking.</p></div>{props.selectedRows.size > 0 && <div className="flex items-center gap-2"><span className="text-xs font-bold text-purple">{props.selectedRows.size} selected</span><Button size="sm" variant="primary" onClick={() => void props.addTracking()} disabled={props.tracking}>{props.tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />} Track</Button></div>}</div><DataTable rows={props.rows} columns={props.columns} rowKey={(row) => `${row.marketCode}:${row.keyword}`} searchKeys={(row) => `${row.keyword} ${row.marketLabel} ${row.intent ?? ""}`} searchPlaceholder="Filter keywords, markets or intent…" pageSize={20} />{props.replayed && <p className="mt-3 text-2xs font-semibold text-success">Reopened from saved evidence—no provider call was made.</p>}</Card>
        <div className="space-y-4"><Card className="p-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-purple" /><h3 className="text-sm font-bold text-ink">Search intent</h3></div><div className="mt-4 space-y-3">{props.intents.map(([intent,count]) => <div key={intent}><div className="mb-1 flex justify-between text-xs"><span className="capitalize text-muted">{intent}</span><span className="font-bold text-ink tnum">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-workspace"><div className="h-full rounded-full" style={{ width: `${Math.max(4,(count / props.rows.length) * 100)}%`, background: INTENT_COLORS[intent] ?? INTENT_COLORS.unknown }} /></div></div>)}</div></Card><Card className="border-purple/20 bg-gradient-to-br from-purple/10 to-[#12B8C4]/5 p-4"><Sparkles className="h-5 w-5 text-purple" /><h3 className="mt-3 text-sm font-bold text-ink">Build a monitoring system</h3><p className="mt-1 text-xs leading-5 text-muted">Select opportunities, choose a cadence and turn research into a named rank-tracking campaign.</p><input value={props.campaignName} onChange={(event) => props.setCampaignName(event.target.value)} placeholder={`${props.seed || "Topic"} tracking`} className="mt-3 h-9 w-full rounded-md border border-border bg-card px-3 text-xs text-ink outline-none focus:border-purple" /><select value={props.cadence} onChange={(event) => props.setCadence(event.target.value as "daily" | "weekly")} className="mt-2 h-9 w-full rounded-md border border-border bg-card px-3 text-xs text-ink"><option value="weekly">Weekly · standard</option><option value="daily">Daily · priority</option></select></Card></div>
      </div>
    </div> : <EmptyState title="Start with a market question" description="Choose up to five markets, enter a topic, domain, competitor or question and build a reusable research project." icon={<Globe2 className="h-7 w-7" />} />}
  </>;
}

function ProjectsView({ projects, newProject, setNewProject, createProject, open }: { projects: Project[]; newProject: string; setNewProject: (value: string) => void; createProject: () => Promise<void>; open: (id: string) => void }) {
  return <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"><Card className="h-fit p-5"><h2 className="text-sm font-bold text-ink">New research project</h2><p className="mt-1 text-xs leading-5 text-muted">Group saved runs, markets and tracking decisions around one strategy.</p><input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="e.g. UAE mortgage growth" className="mt-4 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /><Button variant="primary" className="mt-3 w-full" onClick={() => void createProject()} disabled={!newProject.trim()}><Plus className="h-4 w-4" /> Create project</Button></Card><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project,index) => <button key={project.id} onClick={() => open(project.id)} className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop"><span className="absolute inset-x-0 top-0 h-1" style={{ background: ["#335CFF","#12B8C4","#FF6B5E","#7137F5"][index % 4] }} /><FolderKanban className="h-5 w-5 text-purple" /><h3 className="mt-4 text-base font-extrabold text-ink">{project.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-muted">{project.description || "Reusable keyword evidence, markets and tracking decisions."}</p><div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted"><span>{project.status}</span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div></button>)}{!projects.length && <div className="sm:col-span-2"><EmptyState title="No projects yet" description="Create the first project to organise saved research and tracking decisions." icon={<FolderKanban className="h-6 w-6" />} /></div>}</div></div>;
}

function TrackingView({ campaigns, tracked, siteName }: { campaigns: Campaign[]; tracked: TrackedKeyword[]; siteName: string }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"><Card className="overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold text-ink">Tracking campaigns</h2><p className="mt-0.5 text-2xs text-muted">Named systems created directly from approved research.</p></div><div className="divide-y divide-border">{campaigns.map((campaign) => { const count = tracked.filter((item) => item.campaignId === campaign.id).length; return <div key={campaign.id} className="flex items-center gap-4 px-5 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple/10 text-purple"><Radar className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="font-bold text-ink">{campaign.name}</div><div className="mt-0.5 text-xs text-muted">{count} keywords · {campaign.defaultCadence} · {campaign.searchEngine}</div></div><StatusBadge label="active" tone="success" /></div>; })}{!campaigns.length && <div className="p-5"><EmptyState title="No tracking campaigns" description="Select keywords in Discover and promote them into a daily or weekly monitoring system." icon={<Radar className="h-6 w-6" />} /></div>}</div></Card><Card className="h-fit p-5"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-[#12B8C4]" /><h2 className="text-sm font-bold text-ink">Tracking policy</h2></div><div className="mt-4 space-y-3 text-xs text-muted"><div className="rounded-md bg-workspace p-3"><strong className="block text-ink">Priority keywords</strong><span>Daily checks for launch, revenue and critical competitive terms.</span></div><div className="rounded-md bg-workspace p-3"><strong className="block text-ink">Standard keywords</strong><span>Weekly checks keep broad monitoring affordable across the portfolio.</span></div><div className="flex items-center justify-between border-t border-border pt-3"><span>Tracked for {siteName}</span><strong className="text-ink tnum">{tracked.filter((item) => item.active).length}</strong></div></div></Card></div>;
}
