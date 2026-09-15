"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useDomain } from "@/components/shell/domain-context";
import { REPORT_TEMPLATES } from "@/data/report-templates";
export default function ClientReportPage() {
  const params = useSearchParams(), { sites, range } = useDomain(), siteId = params.get("site") ?? "", site = sites.find(s => s.id === siteId);
  const template = REPORT_TEMPLATES.find(t => t.id === params.get("template")) ?? REPORT_TEMPLATES[1]!;
  const [selected, setSelected] = useState<Record<string, string[]>>({}), [revision, setRevision] = useState(0);
  const sections = selected[template.id] ?? template.sections;
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const query = new URLSearchParams({ site: siteId, template: template.id, days: String(parseInt(range)), revision: String(revision) });
  for (const section of sections) query.append("section", section);
  const src = `/api/reports/preview?${query}`;
  async function archive() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/reports/archive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site: siteId, action: "generate", templateId: template.id, definition: { days: parseInt(range), sections } }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setMessage(body.message); } catch (error) { setMessage(error instanceof Error ? error.message : "PDF generation failed."); } finally { setBusy(false); }
  }
  function move(index: number, delta: number) { const next = [...sections], to = index + delta; if (to < 0 || to >= next.length) return; [next[index], next[to]] = [next[to]!, next[index]!]; setSelected({ ...selected, [template.id]: next }); }
  if (!site) return <EmptyState title="Choose a website" description="Select the website for this client report." />;
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"><Link href={`/reports?site=${siteId}&range=${range}`} className="text-sm text-purple">← Reports</Link><h1 className="mr-auto text-lg font-bold">{template.name}</h1><Link href={`/sites/${siteId}/settings?tab=reporting`} className="text-sm text-purple">Branding</Link><Link href={`/reports?${query}&range=${range}#schedule`} className="text-sm text-purple">Schedule these sections</Link><a href={`${src}&format=csv`} className="text-sm text-purple">Export CSV</a><Button size="sm" onClick={() => setRevision(r => r + 1)}>Refresh saved data</Button><Button size="sm" onClick={() => window.open(src, "_blank", "noopener,noreferrer")}>Open printable report</Button><Button size="sm" variant="primary" disabled={busy} onClick={() => void archive()}>{busy ? "Generating…" : "Archive PDF"}</Button></div><details className="rounded-lg border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Choose and order report sections</summary><div className="mt-3 space-y-2">{sections.map((section, i) => <div key={section} className="flex items-center gap-2 text-sm"><span className="mr-auto">{i + 1}. {section}</span><Button size="sm" disabled={!i} aria-label={`Move ${section} up`} onClick={() => move(i, -1)}>↑</Button><Button size="sm" disabled={i === sections.length - 1} aria-label={`Move ${section} down`} onClick={() => move(i, 1)}>↓</Button><Button size="sm" disabled={sections.length === 1} onClick={() => setSelected({ ...selected, [template.id]: sections.filter(s => s !== section) })}>Remove</Button></div>)}{template.sections.filter(s => !sections.includes(s)).map(s => <Button key={s} size="sm" onClick={() => setSelected({ ...selected, [template.id]: [...sections, s] })}>Add {s}</Button>)}</div></details>{message && <p role="status" className="text-sm">{message} <Link href={`/reports?site=${siteId}#report-archive`} className="text-purple">Open archive</Link></p>}<iframe key={src} title={`${template.name} preview`} src={src} className="h-[80vh] min-h-[640px] w-full rounded-xl border border-border bg-white" /><p className="text-xs text-muted">This preview and archived PDF use the same sections, reporting window and saved evidence. Open the printable report to use your browser’s Save as PDF option.</p></div>;
}
