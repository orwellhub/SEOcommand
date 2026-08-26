"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus, RefreshCw, Star } from "lucide-react";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";

interface Location { id: string; siteSlug: string; name: string; businessKeyword: string; address: string | null; gridSize: number; gridRadiusKm: number; keywords: string[]; active: boolean; approval: string; estimatedMonthlyUsd: number }
interface Snapshot { id: string; locationId: string; capturedOn: string; rating: number | null; reviewCount: number | null; profileCompleteness: number | null; matched: boolean }
interface GridPoint { id: string; locationId: string; keyword: string; capturedOn: string; latitude: number; longitude: number; position: number | null; matched: boolean }

const inputClass = "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-purple";

function Grid({ points }: { points: GridPoint[] }) {
  const sorted = [...points].sort((a, b) => b.latitude - a.latitude || a.longitude - b.longitude);
  const size = Math.round(Math.sqrt(sorted.length));
  return <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(size, 1)}, minmax(0, 1fr))` }}>{sorted.map((point) => {
    const tone = point.position == null ? "bg-critical/10 text-critical" : point.position <= 3 ? "bg-success/15 text-success" : point.position <= 10 ? "bg-warning/15 text-[#9A6B12]" : "bg-purple/10 text-purple";
    return <div key={point.id} title={`${point.latitude}, ${point.longitude}`} className={`flex aspect-square items-center justify-center rounded-md text-xs font-semibold tnum ${tone}`}>{point.position ?? "20+"}</div>;
  })}</div>;
}

export default function LocalSeoPage() {
  const { scope, sites } = useDomain();
  const domain = useResolvedDomain();
  const [locations, setLocations] = useState<Location[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [grid, setGrid] = useState<GridPoint[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gridKeywords, setGridKeywords] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ name: "", businessKeyword: "", address: "", placeId: "", latitude: "", longitude: "", gridRadiusKm: "5", gridSize: "3", keywords: "" });

  const load = useCallback(async () => {
    const response = await fetch(`/api/local-seo?scope=${encodeURIComponent(scope)}`);
    const body = await response.json();
    if (response.ok) { setLocations(body.locations ?? []); setSnapshots(body.snapshots ?? []); setGrid(body.grid ?? []); }
    else setError(body.error ?? "Local SEO data could not be loaded.");
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy("add"); setError(null);
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
      setOpen(false); setDraft({ name: "", businessKeyword: "", address: "", placeId: "", latitude: "", longitude: "", gridRadiusKm: "5", gridSize: "3", keywords: "" }); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Location could not be added."); }
    finally { setBusy(null); }
  };

  const sync = async (locationId: string) => {
    setBusy(locationId); setError(null);
    try {
      const response = await fetch(`/api/local-seo/${locationId}/sync`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Local scan failed.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Local scan failed."); }
    finally { setBusy(null); }
  };

  const approve = async (locationId: string) => {
    setBusy(`approve:${locationId}`); setError(null);
    try {
      const response = await fetch(`/api/local-seo/${locationId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Approval failed.");
      await load();
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
    <PageHeader title="Local SEO" description="Google Business Profile evidence, review movement and geographic Maps visibility." actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add location</Button>} />
    {error && <div role="alert" className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical">{error}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="Locations" value={String(locations.length)} accent />
      <KpiCard label="Average rating" value={averageRating == null || Number.isNaN(averageRating) ? "—" : averageRating.toFixed(1)} hint="Latest collected profiles" />
      <KpiCard label="Google reviews" value={String(latestReviewCount)} hint="Latest public count" />
      <KpiCard label="Grid checks" value={String(grid.length)} hint="Stored map positions" />
    </div>
    {locations.length ? <div className="grid gap-4 xl:grid-cols-2">{locations.map((location) => {
      const latest = latestByLocation.get(location.id);
      const latestDate = grid.find((point) => point.locationId === location.id)?.capturedOn;
      const keyword = gridKeywords[location.id] ?? location.keywords[0];
      const points = grid.filter((point) => point.locationId === location.id && point.keyword === keyword && point.capturedOn === latestDate);
      return <Card key={location.id} className="overflow-hidden"><CardHeader title={location.name} subtitle={`${sites.find((site) => site.id === location.siteSlug)?.name ?? location.siteSlug} · ${location.address || location.businessKeyword}`} action={location.approval === "approved" ? <Button size="sm" onClick={() => sync(location.id)} disabled={busy === location.id}><RefreshCw className={busy === location.id ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />Scan</Button> : <Button size="sm" variant="primary" onClick={() => approve(location.id)} disabled={busy === `approve:${location.id}`}>{busy === `approve:${location.id}` ? "Approving…" : `Approve $${location.estimatedMonthlyUsd.toFixed(2)}/mo`}</Button>} /><div className="grid md:grid-cols-[1fr_220px]"><div className="space-y-4 p-4"><div className="flex flex-wrap gap-2"><StatusBadge label={location.approval === "approved" ? (latest?.matched ? "Profile matched" : "Awaiting match") : "Spend approval required"} tone={location.approval === "approved" ? (latest?.matched ? "success" : "warning") : "info"} /><StatusBadge label={`${latest?.profileCompleteness ?? 0}% complete`} tone={(latest?.profileCompleteness ?? 0) >= 80 ? "success" : "warning"} /></div><div className="grid grid-cols-2 gap-3"><div><div className="text-2xs uppercase tracking-wide text-muted">Rating</div><div className="mt-1 flex items-center gap-1 text-xl font-semibold text-ink"><Star className="h-4 w-4 fill-warning text-warning" />{latest?.rating?.toFixed(1) ?? "—"}</div></div><div><div className="text-2xs uppercase tracking-wide text-muted">Reviews</div><div className="mt-1 text-xl font-semibold text-ink">{latest?.reviewCount ?? "—"}</div></div></div><div><div className="text-2xs uppercase tracking-wide text-muted">Tracked searches</div><div className="mt-2 flex flex-wrap gap-1">{location.keywords.map((item) => <span key={item} className="rounded-full bg-workspace px-2 py-1 text-2xs text-muted">{item}</span>)}</div></div></div><div className="border-t border-border bg-workspace/45 p-4 md:border-l md:border-t-0"><div className="mb-3 flex items-center justify-between gap-2"><div className="min-w-0"><div className="text-xs font-semibold text-ink">Local visibility grid</div>{location.keywords.length > 1 ? <select aria-label={`Grid keyword for ${location.name}`} className="mt-1 max-w-40 bg-transparent text-2xs text-muted outline-none" value={keyword} onChange={(event) => setGridKeywords((current) => ({ ...current, [location.id]: event.target.value }))}>{location.keywords.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <div className="truncate text-2xs text-muted">{keyword || "No keyword"}</div>}</div><MapPin className="h-4 w-4 shrink-0 text-purple" /></div>{points.length ? <Grid points={points} /> : <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-center text-2xs text-muted">{location.approval === "approved" ? <>Run the first scan<br />to build the grid.</> : <>Approve the forecast<br />to activate monitoring.</>}</div>}</div></div></Card>;
    })}</div> : <EmptyState icon={<MapPin className="h-6 w-6" />} title="Add the first business location" description="Use the public GBP name or Place ID, then choose up to five commercial searches for the local grid." />}

    <Drawer open={open} onClose={() => setOpen(false)} title="Add a local location" subtitle={`Assigning to ${domain.name}`} footer={<div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={add} disabled={busy === "add" || !draft.name || !draft.businessKeyword || !draft.keywords}>{busy === "add" ? "Adding…" : "Add location"}</Button></div>}>
      <div className="space-y-4"><label className="block text-xs font-medium text-ink">Public business name<input className={`mt-1.5 ${inputClass}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Walthams" /></label><label className="block text-xs font-medium text-ink">Search identity<input className={`mt-1.5 ${inputClass}`} value={draft.businessKeyword} onChange={(event) => setDraft({ ...draft, businessKeyword: event.target.value })} placeholder="Walthams estate agents Walthamstow" /></label><label className="block text-xs font-medium text-ink">Address<input className={`mt-1.5 ${inputClass}`} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Optional full address" /></label><label className="block text-xs font-medium text-ink">Google Place ID<input className={`mt-1.5 ${inputClass}`} value={draft.placeId} onChange={(event) => setDraft({ ...draft, placeId: event.target.value })} placeholder="Optional but improves exact matching" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-ink">Latitude<input className={`mt-1.5 ${inputClass}`} value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} placeholder="51.58" /></label><label className="block text-xs font-medium text-ink">Longitude<input className={`mt-1.5 ${inputClass}`} value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} placeholder="-0.02" /></label></div><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-ink">Grid size<select className={`mt-1.5 ${inputClass}`} value={draft.gridSize} onChange={(event) => setDraft({ ...draft, gridSize: event.target.value })}><option value="3">3 × 3</option><option value="5">5 × 5</option></select></label><label className="block text-xs font-medium text-ink">Radius (km)<input type="number" min="0.2" max="50" step="0.1" className={`mt-1.5 ${inputClass}`} value={draft.gridRadiusKm} onChange={(event) => setDraft({ ...draft, gridRadiusKm: event.target.value })} /></label></div><label className="block text-xs font-medium text-ink">Grid keywords<textarea className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-purple" value={draft.keywords} onChange={(event) => setDraft({ ...draft, keywords: event.target.value })} placeholder={"estate agents walthamstow\nletting agents near me\nproperty management walthamstow"} /><span className="mt-1 block text-2xs text-muted">One per line, maximum five. A 5 × 5 grid costs more and is forecast before approval.</span></label></div>
    </Drawer>
  </div>;
}
