"use client";
import { useSearchParams } from "next/navigation";
import { ReportTabs, useReportView } from "@/components/reports/report-layout";
import { ListingInventory } from "@/components/research/listing-inventory";
import { LocalWorkflows } from "@/components/research/local-workflows";
import { BusinessManager } from "@/components/research/business-manager";
import { ResearchEvidencePanel } from "@/components/research/evidence-panel";

import { useMemo, useState } from "react";
import { MapPin, Plus, RefreshCw, Star } from "lucide-react";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { useJson } from "@/lib/use-live";
import { Drawer } from "@/components/ui/drawer";

interface Location { id: string; siteSlug: string; name: string; businessKeyword: string; address: string | null; gridSize: number; gridRadiusKm: number; keywords: string[]; active: boolean; approval: string; estimatedMonthlyUsd: number }
interface Snapshot { id: string; locationId: string; capturedOn: string; rating: number | null; reviewCount: number | null; profileCompleteness: number | null; matched: boolean }
interface GridPoint { id: string; locationId: string; keyword: string; capturedOn: string; latitude: number; longitude: number; position: number | null; matched: boolean }

const inputClass = "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-purple";

function Grid({ points, previous = [] }: { points: GridPoint[]; previous?: GridPoint[] }) {
  const latitudes = points.map(p => p.latitude), longitudes = points.map(p => p.longitude);
  const north = Math.max(...latitudes), south = Math.min(...latitudes), west = Math.min(...longitudes), east = Math.max(...longitudes);
  const coordinate = (p: GridPoint) => `${p.latitude.toFixed(5)}:${p.longitude.toFixed(5)}`;
  const before = new Map(previous.map(p => [coordinate(p), p]));
  return <div><div className="mb-2 flex justify-between text-[10px] text-muted"><span>N ↑ · geographic positions</span><span>{points.length} points</span></div><svg role="img" aria-label="Local rankings by geographic coordinates" viewBox="0 0 240 240" className="w-full rounded-lg border border-border bg-card"><defs><pattern id="local-grid-lines" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity=".08"/></pattern></defs><rect width="240" height="240" fill="url(#local-grid-lines)"/>{points.map(p => { const x = 25 + (p.longitude - west) / (east - west || 1) * 190, y = 25 + (north - p.latitude) / (north - south || 1) * 190; return <g key={p.id}><title>{`${p.latitude}, ${p.longitude}: ${p.position == null ? "not found in sampled results" : `position ${p.position}`}`}</title><circle cx={x} cy={y} r={14} fill={p.position == null ? "#f0ece8" : p.position <= 3 ? "#d9f0e5" : p.position <= 10 ? "#ffedc9" : "#eedcf7"}/><text x={x} y={y + 4} textAnchor="middle" fill="#29232e" fontSize={11} fontWeight={700}>{p.position ?? "—"}</text></g>; })}</svg><p className="mt-2 text-[10px] text-muted">{south.toFixed(4)}°–{north.toFixed(4)}° N · {west.toFixed(4)}°–{east.toFixed(4)}° E. Blank ranks mean outside the sampled results.</p>{previous.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Changes at matching coordinates</summary>{points.map(p => { const old = before.get(coordinate(p)), change = old?.position != null && p.position != null ? old.position - p.position : null; return <p key={p.id} className="mt-1">{p.latitude.toFixed(4)}, {p.longitude.toFixed(4)} · {old?.position ?? "—"} → {p.position ?? "—"} · {change == null ? "Not comparable" : change > 0 ? `+${change}` : change}</p>; })}</details>}</div>;
}

export default function LocalSeoPage() {
  const { scope, sites } = useDomain();
  const params = useSearchParams();
  const [view, setView] = useReportView(["overview", "locations", "profiles", "grid", "reviews"] as const, "overview", {"#business-management":"profiles"});
  const tab = params.get("feature") === "reviews" ? "reviews" : view;
  const domain = useResolvedDomain();
  const saved = useJson<{locations: Location[]; snapshots: Snapshot[]; grid: GridPoint[]}>(`/api/local-seo?scope=${encodeURIComponent(scope)}`);
  const connections = useJson<{connected:boolean;records:{kind:string;recordKey:string}[]}>(domain?`/api/business-management?site=${encodeURIComponent(domain.id)}`:null);
  const locations = saved.data?.locations ?? [];
  const snapshots = useMemo(() => saved.data?.snapshots ?? [], [saved.data]);
  const grid = saved.data?.grid ?? [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gridDates, setGridDates] = useState<Record<string, string>>({});
  const [gridKeywords, setGridKeywords] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ name: "", businessKeyword: "", address: "", placeId: "", latitude: "", longitude: "", gridRadiusKm: "5", gridSize: "3", keywords: "" });

  const load = async () => saved.refresh();

  const add = async () => {
    setBusy("add"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/local-seo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        siteSlug: domain.id,
        name: draft.name,
        businessKeyword: draft.businessKeyword,
        address: draft.address || null,
        placeId: draft.placeId || null,
        latitude: draft.latitude ? Number(draft.latitude) : null,
        longitude: draft.longitude ? Number(draft.longitude) : null,
        gridRadiusKm: Number(draft.gridRadiusKm),
        gridSize: Number(draft.gridSize),
        keywords: draft.keywords.split(/\n|,/).map((value) => value.trim()).filter(Boolean),
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Location could not be added.");
      setOpen(false); setDraft({ name: "", businessKeyword: "", address: "", placeId: "", latitude: "", longitude: "", gridRadiusKm: "5", gridSize: "3", keywords: "" }); setNotice("Location saved. Connect the matching Google profile and review the monitoring and grid settings to begin."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Location could not be added."); }
    finally { setBusy(null); }
  };

  const sync = async (locationId: string) => {
    setBusy(locationId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/local-seo/${locationId}/sync`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Local scan failed.");
      setNotice("Local scan queued. Stored profile and grid evidence will refresh when collection completes."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Local scan failed."); }
    finally { setBusy(null); }
  };

  const approve = async (locationId: string) => {
    setBusy(`approve:${locationId}`); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/local-seo/${locationId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Approval failed.");
      setNotice("Local SEO forecast approved for this location."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Approval failed."); }
    finally { setBusy(null); }
  };

  const latestByLocation = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const snapshot of snapshots) if (!map.has(snapshot.locationId)) map.set(snapshot.locationId, snapshot);
    return map;
  }, [snapshots]);
  const latestSnapshots = [...latestByLocation.values()];
  const ratedLocations = latestSnapshots.filter((item) => item.rating != null);
  const averageRating = ratedLocations.length ? ratedLocations.reduce((sum, item) => sum + (item.rating ?? 0), 0) / ratedLocations.length : null;
  const latestReviewCount = latestSnapshots.reduce((sum, item) => sum + (item.reviewCount ?? 0), 0);

  return <div className="animate-in space-y-5">
    <PageHeader title={tab === "grid" ? "Map Rank Tracker" : tab === "profiles" ? "GBP Optimization" : tab === "reviews" ? "Review Management" : tab === "locations" ? "Listing Management" : "Local Dashboard"} description="Google Business Profile evidence, review movement and geographic Maps visibility." actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add location</Button>} />
    <ReportTabs items={[{id:"overview",label:"Overview"},{id:"locations",label:"Listings"},{id:"reviews",label:"Reviews"},{id:"profiles",label:"Business profiles"},{id:"grid",label:"Map rankings"}]} value={tab} onChange={setView} label="Local reports" />
    {tab === "overview" && <Card className="p-4"><h2 className="mb-3 text-base font-semibold">Set up local visibility</h2><div className="grid gap-3 md:grid-cols-4">{[{title:"1. Add location",done:locations.length>0,detail:"Business name, address and Google Place ID",action:()=>setOpen(true)},{title:"2. Connect Google profile",done:Boolean(connections.data?.connected && connections.data.records.some(row=>row.kind==="workspace_business")),detail:"Verify your account manages the matching location",action:()=>setView("profiles")},{title:"3. Choose keywords & grid",done:locations.some(row=>row.keywords.length>0),detail:"Review map area, collection cost and approval",action:()=>setView("grid")},{title:"4. Review saved results",done:snapshots.length>0,detail:"Compare dated maps, reviews and competitors",action:()=>setView("grid")}].map(step=><button key={step.title} className="rounded border border-border bg-workspace/30 p-3 text-left hover:border-purple/40" onClick={step.action}><h3 className="text-sm font-semibold">{step.title}{step.done?" ✓":""}</h3><p className="mt-1 text-xs text-muted">{step.detail}</p></button>)}</div></Card>}
    {tab === "reviews" && <><BusinessManager reviewsOnly /><LocalWorkflows reviews /><ResearchEvidencePanel features={["reviews"]} /></>}
    {tab === "locations" && <ListingInventory locations={locations} />}
    {tab === "profiles" && <section id="business-management" className="scroll-mt-6"><BusinessManager /><div className="mt-4"><LocalWorkflows /></div></section>}
    {notice && <div role="status" className="rounded-md border border-success/20 bg-success/5 p-3 text-xs font-semibold text-success">{notice}</div>}
    {(error || saved.error) && <div role="alert" className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical">{error ?? saved.error} <button onClick={saved.refresh} className="underline">Retry</button></div>}
    {["overview", "grid"].includes(tab) && <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="Locations" value={saved.data ? String(locations.length) : "—"} accent />
      <KpiCard label="Average rating" value={averageRating == null || Number.isNaN(averageRating) ? "—" : averageRating.toFixed(1)} hint="Latest collected profiles" />
      <KpiCard label="Google reviews" value={latestSnapshots.some((item) => item.reviewCount != null) ? String(latestReviewCount) : "—"} hint="Latest public count" />
      <KpiCard label="Grid checks" value={saved.data ? String(grid.length) : "—"} hint="Stored map positions" />
    </div>
    {locations.length ? <div className="grid gap-4 xl:grid-cols-2">{locations.map((location) => {
      const latest = latestByLocation.get(location.id);
      const availableDates = [...new Set(grid.filter(p => p.locationId === location.id).map(p => p.capturedOn))].sort().reverse();
      const latestDate = gridDates[location.id] ?? availableDates[0];
      const previousDate = availableDates.find(date => date < (latestDate ?? ""));
      const keyword = gridKeywords[location.id] ?? location.keywords[0];
      const points = grid.filter((point) => point.locationId === location.id && point.keyword === keyword && point.capturedOn === latestDate);
      return <Card key={location.id} className="overflow-hidden"><CardHeader title={location.name} subtitle={`${sites.find((site) => site.id === location.siteSlug)?.name ?? location.siteSlug} · ${location.address || location.businessKeyword}`} action={location.approval === "approved" ? <Button size="sm" onClick={() => sync(location.id)} disabled={busy === location.id}><RefreshCw className={busy === location.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />Scan</Button> : <Button size="sm" variant="primary" onClick={() => approve(location.id)} disabled={busy === `approve:${location.id}`}>{busy === `approve:${location.id}` ? "Approving…" : `Approve $${location.estimatedMonthlyUsd.toFixed(2)}/mo`}</Button>} /><div className="grid md:grid-cols-[1fr_220px]"><div className="space-y-4 p-4"><div className="flex flex-wrap gap-2"><StatusBadge label={location.approval === "approved" ? (latest?.matched ? "Profile matched" : "Awaiting match") : "Spend approval required"} tone={location.approval === "approved" ? (latest?.matched ? "success" : "warning") : "info"} /><StatusBadge label={latest?.profileCompleteness == null ? "Completeness unavailable" : `${latest.profileCompleteness}% complete`} tone={(latest?.profileCompleteness ?? 0) >= 80 ? "success" : "warning"} /></div><div className="grid grid-cols-2 gap-3"><div><div className="text-2xs uppercase tracking-wide text-muted">Rating</div><div className="mt-1 flex items-center gap-1 text-xl font-semibold text-ink"><Star className="h-4 w-4 fill-warning text-warning" />{latest?.rating?.toFixed(1) ?? "—"}</div></div><div><div className="text-2xs uppercase tracking-wide text-muted">Reviews</div><div className="mt-1 text-xl font-semibold text-ink">{latest?.reviewCount ?? "—"}</div></div></div><div><div className="text-2xs uppercase tracking-wide text-muted">Tracked searches</div><div className="mt-2 flex flex-wrap gap-1">{location.keywords.map((item) => <span key={item} className="rounded-full bg-workspace px-2 py-1 text-2xs text-muted">{item}</span>)}</div></div></div><div className="border-t border-border bg-workspace/45 p-4 md:border-l md:border-t-0"><div className="mb-3 flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-xs font-semibold text-ink">Local visibility grid</div>{location.keywords.length > 1 ? <select aria-label={`Grid keyword for ${location.name}`} className="mt-1 max-w-40 bg-transparent text-2xs text-muted outline-none" value={keyword} onChange={(event) => setGridKeywords((current) => ({ ...current, [location.id]: event.target.value }))}>{location.keywords.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <div className="truncate text-2xs text-muted">{keyword || "No keyword"}</div>}</div><MapPin className="h-4 w-4 shrink-0 text-purple" /></div>{availableDates.length > 0 && <select aria-label={`Grid date for ${location.name}`} className="mb-3 w-full rounded border border-border bg-card p-2 text-xs" value={latestDate} onChange={e => setGridDates(dates => ({ ...dates, [location.id]: e.target.value }))}>{availableDates.map(date => <option key={date}>{date}</option>)}</select>}{points.length ? <Grid points={points} previous={grid.filter(p => p.locationId === location.id && p.keyword === keyword && p.capturedOn === previousDate)} /> : <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-center text-2xs text-muted">{location.approval === "approved" ? <>Run the first scan<br />to build the grid.</> : <>Approve the forecast<br />to activate monitoring.</>}</div>}</div></div></Card>;
    })}</div> : <EmptyState icon={<MapPin className="h-6 w-6" />} title={saved.loading ? "Loading saved business locations…" : "Add the first business location"} description="Use the public GBP name or Place ID, then choose up to five commercial searches for the local grid." />}

    </>}
    <Drawer open={open} onClose={() => setOpen(false)} title="Add a local location" subtitle={`Assigning to ${domain.name}`} footer={<div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={add} disabled={busy === "add" || !draft.name || !draft.businessKeyword || !draft.keywords}>{busy === "add" ? "Adding…" : "Add location"}</Button></div>}>
      <div className="space-y-4"><label className="block text-xs font-medium text-ink">Public business name<input className={`mt-1.5 ${inputClass}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Walthams" /></label><label className="block text-xs font-medium text-ink">Search identity<input className={`mt-1.5 ${inputClass}`} value={draft.businessKeyword} onChange={(event) => setDraft({ ...draft, businessKeyword: event.target.value })} placeholder="Walthams estate agents Walthamstow" /></label><label className="block text-xs font-medium text-ink">Address<input className={`mt-1.5 ${inputClass}`} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Optional full address" /></label><label className="block text-xs font-medium text-ink">Google Place ID<input className={`mt-1.5 ${inputClass}`} value={draft.placeId} onChange={(event) => setDraft({ ...draft, placeId: event.target.value })} placeholder="Optional but improves exact matching" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-ink">Latitude<input className={`mt-1.5 ${inputClass}`} value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} placeholder="51.58" /></label><label className="block text-xs font-medium text-ink">Longitude<input className={`mt-1.5 ${inputClass}`} value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} placeholder="-0.02" /></label></div><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-ink">Grid size<select className={`mt-1.5 ${inputClass}`} value={draft.gridSize} onChange={(event) => setDraft({ ...draft, gridSize: event.target.value })}><option value="3">3 × 3</option><option value="5">5 × 5</option></select></label><label className="block text-xs font-medium text-ink">Radius (km)<input type="number" min="0.2" max="50" step="0.1" className={`mt-1.5 ${inputClass}`} value={draft.gridRadiusKm} onChange={(event) => setDraft({ ...draft, gridRadiusKm: event.target.value })} /></label></div><label className="block text-xs font-medium text-ink">Grid keywords<textarea className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-purple" value={draft.keywords} onChange={(event) => setDraft({ ...draft, keywords: event.target.value })} placeholder={"estate agents walthamstow\nletting agents near me\nproperty management walthamstow"} /><span className="mt-1 block text-2xs text-muted">One per line, maximum five. A 5 × 5 grid costs more and is forecast before approval.</span></label></div>
    </Drawer>
  </div>;
}
