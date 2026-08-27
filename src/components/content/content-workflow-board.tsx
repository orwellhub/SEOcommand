"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, FileEdit, Loader2 } from "lucide-react";
import { Button, Card, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";

const stages = ["brief", "draft", "review", "published"] as const;
type Stage = typeof stages[number];
type Brief = { primaryKeyword: string; secondaryKeywords: string[]; searchIntent: "informational" | "commercial" | "transactional" | "navigational" | "mixed"; titleRecommendation: string; metaRecommendation: string; headingPlan: string[]; coverageNotes: string[]; internalLinks: string[]; schemaRecommendations: string[] };
type ContentItem = { id: string; title: string; contentStage: Stage; executionType: string; priorityScore: number; targetUrl: string | null; plannedUrl: string | null; ownerEmail: string | null; dueDate: string | null; draftUrl: string | null; publishedUrl: string | null; brief: Partial<Brief>; executionData?: { targetKeywords?: string[] } };

const inputClass = "mt-1 h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple";
const emptyBrief: Brief = { primaryKeyword: "", secondaryKeywords: [], searchIntent: "mixed", titleRecommendation: "", metaRecommendation: "", headingPlan: [], coverageNotes: [], internalLinks: [], schemaRecommendations: [] };
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

export function ContentWorkflowBoard({ siteSlug }: { siteSlug: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [draftUrl, setDraftUrl] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try { const response = await fetch(`/api/content-workflow?site=${encodeURIComponent(siteSlug)}`, { signal }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Content workflow could not be loaded."); setItems(body.items ?? []); }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Content workflow could not be loaded."); }
    finally { setLoading(false); }
  }, [siteSlug]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { if (!selected) return; setBrief({ ...emptyBrief, ...selected.brief }); setDraftUrl(selected.draftUrl ?? ""); setPublishedUrl(selected.publishedUrl ?? ""); setError(null); }, [selected]);

  const updateItem = (patch: Partial<ContentItem> & { id: string }) => { setItems((current) => current.map((item) => item.id === patch.id ? { ...item, ...patch } : item)); setSelected((current) => current?.id === patch.id ? { ...current, ...patch } : current); };
  const saveBrief = async () => { if (!selected) return; setBusy(true); setError(null); try { const response = await fetch("/api/content-workflow", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "update_brief", brief }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Brief could not be saved."); updateItem(body.item); } catch (reason) { setError(reason instanceof Error ? reason.message : "Brief could not be saved."); } finally { setBusy(false); } };
  const nextStage = selected ? stages[stages.indexOf(selected.contentStage) + 1] : undefined;
  const advance = async () => { if (!selected || !nextStage) return; setBusy(true); setError(null); try { const response = await fetch("/api/content-workflow", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "advance", stage: nextStage, draftUrl: draftUrl || null, publishedUrl: publishedUrl || null }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Content could not be advanced."); updateItem(body.item); } catch (reason) { setError(reason instanceof Error ? reason.message : "Content could not be advanced."); } finally { setBusy(false); } };
  const byStage = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, items.filter((item) => item.contentStage === stage)])) as Record<Stage, ContentItem[]>, [items]);
  const setList = (key: keyof Brief, value: string) => setBrief((current) => ({ ...current, [key]: lines(value) }));

  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3"><div><h3 className="text-sm font-semibold text-ink">Content production</h3><p className="mt-0.5 text-2xs text-muted">Approved opportunities move through a visible brief → draft → review → publish workflow.</p></div><StatusBadge label={`${items.length} active items`} tone="info" /></div>
    {loading ? <div className="p-6 text-xs text-muted">Loading editorial work…</div> : items.length === 0 ? <div className="p-4"><EmptyState icon={<FileEdit className="h-5 w-5" />} title="No approved content work" description="Create a brief from a page or keyword finding to begin." /></div> : <div className="grid min-w-[840px] grid-cols-4 divide-x divide-border overflow-x-auto">{stages.map((stage) => <section key={stage} className="min-h-52 bg-workspace/20 p-3"><div className="mb-3 flex items-center justify-between"><span className="text-2xs font-bold uppercase tracking-[0.14em] text-muted">{stage}</span><span className="text-2xs text-muted tnum">{byStage[stage].length}</span></div><div className="space-y-2">{byStage[stage].map((item) => <button key={item.id} onClick={() => setSelected(item)} className="w-full rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:border-purple/50"><div className="text-xs font-semibold leading-5 text-ink">{item.title}</div><div className="mt-2 truncate font-mono text-[10px] text-muted">{item.targetUrl || item.plannedUrl || "Destination pending"}</div><div className="mt-2 flex justify-between text-[10px] text-muted"><span>{item.ownerEmail || "Unassigned"}</span><span className="font-bold text-purple">P{item.priorityScore}</span></div></button>)}</div></section>)}</div>}
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? "Content work"} subtitle="On-page brief and editorial handoff" width="max-w-2xl" footer={<div className="flex items-center justify-between gap-3"><span className="text-[10px] text-muted">SEOcommand stores the brief and evidence; drafting remains human or external.</span><div className="flex gap-2"><Button onClick={saveBrief} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save brief</Button>{nextStage && <Button variant="primary" onClick={advance} disabled={busy || (nextStage === "review" && !draftUrl.trim()) || (nextStage === "published" && !publishedUrl.trim())}>Move to {nextStage}<ArrowRight className="h-3.5 w-3.5" /></Button>}</div></div>}>
      {selected && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-ink">Primary keyword<input className={inputClass} value={brief.primaryKeyword} onChange={(e) => setBrief({ ...brief, primaryKeyword: e.target.value })} /></label><label className="text-xs font-semibold text-ink">Intent<select className={inputClass} value={brief.searchIntent} onChange={(e) => setBrief({ ...brief, searchIntent: e.target.value as Brief["searchIntent"] })}>{["informational","commercial","transactional","navigational","mixed"].map((value) => <option key={value}>{value}</option>)}</select></label></div><label className="block text-xs font-semibold text-ink">Secondary keywords<textarea className={`${inputClass} h-20 py-2`} value={brief.secondaryKeywords.join("\n")} onChange={(e) => setList("secondaryKeywords", e.target.value)} placeholder="One per line" /></label><label className="block text-xs font-semibold text-ink">Recommended title<input className={inputClass} value={brief.titleRecommendation} onChange={(e) => setBrief({ ...brief, titleRecommendation: e.target.value })} /></label><label className="block text-xs font-semibold text-ink">Recommended meta description<textarea className={`${inputClass} h-20 py-2`} value={brief.metaRecommendation} onChange={(e) => setBrief({ ...brief, metaRecommendation: e.target.value })} /></label>{([['headingPlan','Heading plan'],['coverageNotes','Coverage notes'],['internalLinks','Internal links'],['schemaRecommendations','Schema recommendations']] as const).map(([key,label]) => <label key={key} className="block text-xs font-semibold text-ink">{label}<textarea className={`${inputClass} h-20 py-2`} value={brief[key].join("\n")} onChange={(e) => setList(key, e.target.value)} placeholder="One per line" /></label>)}{(selected.contentStage === "draft" || selected.contentStage === "review") && <label className="block text-xs font-semibold text-ink">External draft URL<input className={inputClass} value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} placeholder="https://docs…" /></label>}{selected.contentStage === "review" && <label className="block text-xs font-semibold text-ink">Published URL<input className={inputClass} value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://site…" /></label>}{error && <div role="alert" className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical">{error}</div>}</div>}
    </Drawer>
  </Card>;
}
