"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Clock3, Database, ExternalLink, FileSearch, Globe2, History, Loader2, MapPin, Search, ShieldCheck, Target, X } from "lucide-react";
import { useDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, Skeleton, SourceBadge, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { compactNumber, currency } from "@/lib/format";
import { DEFAULT_MARKET } from "@/lib/markets";
import { cn } from "@/lib/cn";
import { DOMAIN_RESEARCH_ESTIMATE_USD } from "@/lib/research";
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
  { key: "keyword", header: "Keyword", width: "34%", sortValue: (row) => row.keyword, render: (row) => <div><div className="font-semibold text-ink">{row.keyword}</div><div className="mt-0.5 truncate text-[10px] text-muted">{row.url ? shortUrl(row.url) : "No ranking URL"}</div></div> },
  { key: "position", header: "Position", align: "right", sortValue: (row) => row.position ?? 999, render: (row) => row.position ?? "—" },
  { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume ?? -1, render: (row) => metric(row.volume) },
  { key: "traffic", header: "Est. traffic", align: "right", sortValue: (row) => row.traffic ?? -1, render: (row) => metric(row.traffic) },
  { key: "difficulty", header: "Difficulty", align: "right", sortValue: (row) => row.difficulty ?? -1, render: (row) => <StatusBadge label={row.difficulty == null ? "—" : String(Math.round(row.difficulty))} tone={row.difficulty == null ? "neutral" : row.difficulty < 35 ? "success" : row.difficulty < 65 ? "warning" : "critical"} /> },
  { key: "intent", header: "Intent", align: "center", sortValue: (row) => row.intent ?? "", render: (row) => <span className="text-xs capitalize text-muted">{row.intent ?? "Unknown"}</span> },
];

export default function DomainResearchPage() {
  const { sites } = useDomain();
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
  const [running, setRunning] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mappingSite, setMappingSite] = useState("");
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
      setActive(evidence); setTargetHost(evidence.sourceValue); setMappingTitle(`Investigate ${evidence.sourceValue} opportunity`); setTargetKeywords((evidence.evidence?.keywords ?? []).slice(0, 5).map((item) => item.keyword).join("\n"));
      await loadMappings(evidence.id);
      if (updateUrl) router.replace(`/domain-research?evidence=${encodeURIComponent(evidence.id)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Research evidence could not be opened."); }
    finally { setLoadingEvidence(false); }
  }, [loadMappings, router]);

  useEffect(() => {
    let live = true;
    fetch("/api/domain-research", { cache: "no-store" }).then((response) => response.json().then((body) => ({ response, body }))).then(({ response, body }) => { if (live) setSaved(response.ok ? body.evidence ?? [] : []); }).catch(() => { if (live) setSaved([]); }).finally(() => { if (live) setLoadingSaved(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.user?.email) setOwnerEmail(body.user.email); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = searchParams.get("evidence");
    if (id) void openEvidence(id, false);
  }, [openEvidence, searchParams]);

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
      setActive(evidence); setSaved((current) => [evidence, ...current.filter((item) => item.id !== evidence.id)]); setMappings([]); setMappingTitle(`Investigate ${evidence.sourceValue} opportunity`); setTargetKeywords((evidence.evidence?.keywords ?? []).slice(0, 5).map((item) => item.keyword).join("\n"));
      router.replace(`/domain-research?evidence=${encodeURIComponent(evidence.id)}`);
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
  const strongestPages = useMemo(() => [...(active?.evidence?.pages ?? [])].sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0)).slice(0, 8), [active]);

  return <div className="animate-in space-y-5">
    <PageHeader title="Domain research" description="Investigate any domain globally, preserve the evidence and map only qualified opportunities into a website workflow." />

    <Card className="relative overflow-visible border-[#12B8C4]/25">
      <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-lg bg-[#12B8C4]" />
      <div className="grid gap-4 p-5 pl-7 lg:grid-cols-[minmax(280px,1.3fr)_minmax(260px,0.8fr)_auto] lg:items-end">
        <label><span className="mb-1.5 block text-2xs font-bold uppercase tracking-[0.12em] text-muted">Domain or website</span><div className="relative"><Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0E98A3]" /><input value={targetHost} onChange={(event) => setTargetHost(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runResearch(); }} placeholder="e.g. competitor.com" className="h-11 w-full rounded-md border border-border bg-card pl-10 pr-3 text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-[#12B8C4]" /></div></label>
        <div className="relative"><span className="mb-1.5 block text-2xs font-bold uppercase tracking-[0.12em] text-muted">Search market</span><button type="button" onClick={() => setLocationOpen((value) => !value)} className="flex h-11 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm font-semibold text-ink"><MapPin className="h-4 w-4 text-purple" /><span className="min-w-0 flex-1 truncate">{location.parent ? `${location.name}, ${location.parent}` : location.name}</span></button>{locationOpen && <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-pop"><div className="flex items-center gap-2 border-b border-border px-3 py-2"><Search className="h-4 w-4 text-muted" /><input autoFocus value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Country, city or region" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /><button onClick={() => setLocationOpen(false)}><X className="h-4 w-4 text-muted" /></button></div><div className="max-h-64 overflow-y-auto p-1.5">{locations.map((item) => <button key={item.code} onClick={() => { setLocation(item); setLocationOpen(false); setLocationQuery(""); }} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-workspace"><MapPin className="h-4 w-4 text-[#12B8C4]" /><span><span className="block text-sm font-semibold text-ink">{item.name}</span><span className="block text-[10px] text-muted">{item.parent ?? item.countryCode ?? "Worldwide"} · {item.type}</span></span></button>)}{locationQuery && !locations.length && <div className="p-4 text-center text-xs text-muted">Searching worldwide locations…</div>}</div></div>}</div>
        <div><Button variant="primary" className="h-11 w-full px-5" onClick={() => void runResearch()} disabled={!targetHost.trim() || running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Run live research</Button><div className="mt-1.5 text-center text-[10px] text-muted">Estimated provider cost ≤ {currency(DOMAIN_RESEARCH_ESTIMATE_USD)}</div></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-workspace/45 px-7 py-3 text-2xs text-muted"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Budget checked before collection</span><span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5 text-purple" /> Results saved as reusable evidence</span><span className="ml-auto">Opening saved evidence makes no provider call</span></div>
    </Card>

    {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-critical/25 bg-critical/5 px-4 py-3 text-sm text-critical"><X className="h-4 w-4" />{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden"><div className="border-b border-border px-4 py-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-purple" /><h2 className="text-sm font-bold text-ink">Saved investigations</h2></div><p className="mt-1 text-[10px] text-muted">Stored evidence, newest first</p></div>{loadingSaved ? <div className="space-y-2 p-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : saved.length ? <div className="max-h-[620px] divide-y divide-border overflow-y-auto">{saved.map((item) => <button key={item.id} onClick={() => void openEvidence(item.id)} className={cn("w-full px-4 py-3 text-left hover:bg-workspace", active?.id === item.id && "bg-[#12B8C4]/[0.07]")}><div className="truncate text-sm font-bold text-ink">{item.sourceValue}</div><div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted"><span className="truncate">{item.locationLabel}</span><span className="shrink-0">{freshness(item.capturedAt)}</span></div></button>)}</div> : <div className="p-4"><EmptyState title="No domain evidence" description="Run the first investigation above. It will be stored automatically." icon={<History className="h-5 w-5" />} /></div>}</Card>

      {loadingEvidence ? <div className="space-y-4"><Skeleton className="h-24" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-96" /></div> : active ? <div className="space-y-5">
        <Card className="overflow-hidden border-0 bg-ink text-white"><div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><SourceBadge source="dataforseo" mode="live" freshness="fresh" /><StatusBadge label="saved evidence" tone="info" /></div><h2 className="mt-3 text-2xl font-black tracking-tight">{active.sourceValue}</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{active.locationLabel}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{new Date(active.capturedAt).toLocaleString()}</span><span>Actual cost {currency(active.providerCostUsd)}</span></div></div><a href={`https://${active.sourceValue}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-bold text-white/75 hover:bg-white/10">Visit domain <ExternalLink className="h-3.5 w-3.5" /></a></div><div className="grid grid-cols-4 border-t border-white/10 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/40"><div className="border-r border-white/10 px-2 py-3 text-white">Evidence</div><div className="border-r border-white/10 px-2 py-3">Qualify</div><div className={cn("border-r border-white/10 px-2 py-3", mappings.length && "text-[#7FE4EA]")}>Map</div><div className="px-2 py-3">Approve</div></div></Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
          ["Organic keywords", metric(active.summary.organicKeywords), "#335CFF"],
          ["Organic traffic", metric(active.summary.organicTraffic), "#12B8C4"],
          ["Traffic value", active.summary.estimatedTrafficCost == null ? "—" : currency(active.summary.estimatedTrafficCost), "#7137F5"],
          ["Referring domains", metric(backlinks?.referringDomains), "#F2B544"],
          ["Domain rank", metric(backlinks?.rank), "#FF6B5E"],
        ].map(([label,value,color]) => <Card key={label} className="relative overflow-hidden p-4"><span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} /><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div><div className="mt-2 text-2xl font-black tracking-tight text-ink tnum">{value}</div></Card>)}</div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-5"><Card className="overflow-hidden p-4"><div className="mb-3"><h3 className="text-sm font-bold text-ink">Organic keyword footprint</h3><p className="mt-0.5 text-2xs text-muted">The strongest keyword evidence collected for this market.</p></div><DataTable rows={keywords} columns={KEYWORD_COLUMNS} rowKey={(row) => row.keyword} searchKeys={(row) => `${row.keyword} ${row.intent ?? ""} ${row.url ?? ""}`} searchPlaceholder="Filter keyword evidence…" exportName={`${active.sourceValue}-domain-keywords`} pageSize={15} /></Card><Card className="overflow-hidden"><div className="border-b border-border px-5 py-4"><h3 className="text-sm font-bold text-ink">Pages creating the footprint</h3><p className="mt-0.5 text-2xs text-muted">Evidence ranked by estimated organic traffic.</p></div><div className="divide-y divide-border">{strongestPages.map((page, index) => <div key={page.url} className="grid gap-2 px-5 py-3 sm:grid-cols-[28px_minmax(0,1fr)_90px_90px] sm:items-center"><span className="text-xs font-black text-muted tnum">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><div className="truncate text-xs font-semibold text-ink">{shortUrl(page.url)}</div><div className="truncate text-[10px] text-muted">{page.url}</div></div><div className="text-right"><div className="text-xs font-bold text-ink tnum">{metric(page.traffic)}</div><div className="text-[10px] text-muted">traffic</div></div><div className="text-right"><div className="text-xs font-bold text-ink tnum">{metric(page.keywords)}</div><div className="text-[10px] text-muted">keywords</div></div></div>)}{!strongestPages.length && <div className="p-5 text-xs text-muted">No page evidence was returned for this market.</div>}</div></Card></div>

          <aside className="space-y-4"><Card className="overflow-hidden border-purple/20"><div className="border-b border-border bg-purple/[0.04] px-5 py-4"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-purple" /><h3 className="text-sm font-bold text-ink">Turn evidence into work</h3></div><p className="mt-1 text-xs leading-5 text-muted">Carry the evidence, destination, owner and deadline into one approval-ready execution item.</p></div><div className="space-y-4 p-5"><div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-md bg-workspace p-3"><div className="text-lg font-black text-ink tnum">{keywords.length}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted">keywords</div></div><div className="rounded-md bg-workspace p-3"><div className="text-lg font-black text-ink tnum">{active.evidence?.pages?.length ?? 0}</div><div className="text-[10px] font-bold uppercase tracking-wide text-muted">pages</div></div></div><Button variant="primary" className="w-full" onClick={() => { setMappedNow(false); setMappingWarning(null); setMappingOpen(true); }}><Building2 className="h-4 w-4" /> Convert opportunity</Button><p className="text-[10px] leading-4 text-muted">No work starts until a reviewer approves it in Action Centre.</p></div></Card>
          {mappings.length > 0 && <Card className="p-4"><div className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">Website mappings</div><div className="mt-3 space-y-2">{mappings.map((mapping) => <div key={mapping.id} className="flex items-center justify-between gap-2 rounded-md bg-workspace px-3 py-2"><div className="min-w-0"><div className="truncate text-xs font-bold text-ink">{sites.find((site) => site.id === mapping.siteSlug)?.name ?? mapping.siteSlug}</div><div className="text-[10px] text-muted">Priority {mapping.priorityScore}</div></div><StatusBadge label={mapping.status} tone={mapping.status === "approved" ? "success" : mapping.status === "rejected" ? "critical" : "warning"} /></div>)}</div></Card>}
          </aside></div>
      </div> : <Card className="flex min-h-[420px] items-center justify-center p-6"><EmptyState title="Investigate any domain" description="Enter a competitor, market leader, publisher or acquisition target. The result is saved globally and remains independent until you map it." icon={<Globe2 className="h-7 w-7" />} /></Card>}
    </div>

    {active && <Drawer open={mappingOpen} onClose={() => setMappingOpen(false)} title="Convert opportunity" subtitle={`${active.sourceValue} · ${active.locationLabel}`} width="max-w-xl" footer={<div className="flex items-center justify-between gap-3"><span className="text-[10px] text-muted">Mapping saves a proposal; it does not start execution.</span><div className="flex gap-2"><Button onClick={() => setMappingOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => void mapEvidence()} disabled={!mappingSite || !mappingTitle.trim() || !ownerEmail.trim() || !dueDate || (pageMode === "existing_page" && !targetUrl.trim()) || (pageMode === "new_page" && !plannedUrl.trim()) || mappingBusy}>{mappingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />} Save for approval</Button></div></div>}>
      <div className="space-y-5">
        <div className="rounded-lg border border-[#12B8C4]/25 bg-[#12B8C4]/[0.06] p-4"><div className="text-2xs font-bold uppercase tracking-[0.12em] text-[#0E98A3]">Evidence carried forward</div><div className="mt-2 text-sm font-bold text-ink">{active.title}</div><div className="mt-1 text-xs text-muted">{metric(active.summary.organicKeywords)} keywords · {metric(active.summary.organicTraffic)} estimated traffic · captured {freshness(active.capturedAt)}</div></div>

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">1 · Destination and output</div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-ink">Website</span><select value={mappingSite} onChange={(event) => setMappingSite(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink"><option value="">Choose a website</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label><span className="mb-1 block text-xs font-semibold text-ink">Execution type</span><select value={executionType} onChange={(event) => setExecutionType(event.target.value as typeof executionType)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink">{EXECUTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Opportunity title</span><input value={mappingTitle} onChange={(event) => setMappingTitle(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label></section>

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">2 · Page plan</div><div className="grid grid-cols-3 gap-2">{([['new_page','New page'],['existing_page','Existing page'],['site_wide','Site-wide']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setPageMode(value)} className={cn("rounded-md border px-2 py-2 text-xs font-semibold", pageMode === value ? "border-purple bg-purple/10 text-purple" : "border-border text-muted hover:text-ink")}>{label}</button>)}</div>{pageMode === "existing_page" && <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Target URL</span><input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://site.com/existing-page" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label>}{pageMode === "new_page" && <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Planned URL or path</span><input value={plannedUrl} onChange={(event) => setPlannedUrl(event.target.value)} placeholder="/guides/new-opportunity" className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label>}<label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Target keywords <span className="font-normal text-muted">one per line</span></span><textarea value={targetKeywords} onChange={(event) => setTargetKeywords(event.target.value)} rows={4} className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-purple" /></label></section>

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">3 · Ownership and value</div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-ink">Owner email</span><input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label><label><span className="mb-1 block text-xs font-semibold text-ink">Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label></div><label className="mt-3 block"><span className="mb-1 flex items-center justify-between text-xs font-semibold text-ink"><span>Priority</span><span className="text-purple tnum">{priorityScore}/100</span></span><input type="range" min="0" max="100" step="5" value={priorityScore} onChange={(event) => setPriorityScore(Number(event.target.value))} className="w-full accent-purple" /></label><label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Qualification notes</span><textarea value={mappingNotes} onChange={(event) => setMappingNotes(event.target.value)} placeholder="Why this matters, expected value and recommended next action" rows={4} className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" /></label></section>

        {mappedNow && <div className="rounded-lg border border-success/25 bg-success/5 p-4"><div className="flex items-center gap-2 text-sm font-bold text-success"><CheckCircle2 className="h-4 w-4" />Opportunity mapped and awaiting approval</div><Link href="/action-centre" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-purple">Review in Action Centre <ArrowRight className="h-3.5 w-3.5" /></Link></div>}
        {mappingWarning && <div className={cn("rounded-lg border p-4", mappingWarning.severity === "warning" ? "border-warning/30 bg-warning/5" : "border-[#12B8C4]/25 bg-[#12B8C4]/[0.05]")}><div className="flex items-start gap-2"><AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", mappingWarning.severity === "warning" ? "text-warning" : "text-[#0E98A3]")} /><div><div className="text-xs font-bold text-ink">Duplicate and cannibalisation check</div><p className="mt-1 text-xs leading-5 text-muted">{mappingWarning.summary}</p></div></div>{mappingWarning.matches.length > 0 && <div className="mt-3 space-y-1">{mappingWarning.matches.map((match, index) => <div key={`${match.kind}:${match.label}:${index}`} className="rounded bg-card px-2.5 py-2 text-[10px] text-muted"><span className="font-bold uppercase text-ink">{match.kind}</span> · {match.label}{match.url ? ` · ${shortUrl(match.url)}` : ""}</div>)}</div>}</div>}
      </div>
    </Drawer>}
  </div>;
}
