"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Link2, Mail, Search, Send, ShieldCheck } from "lucide-react";
import { useResolvedDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";

interface Prospect { id: string; sourceDomain: string; sourceUrl: string | null; authority: number | null; relevance: number; reason: string; competitorHosts: string[]; contacts: Array<{ type?: string; value?: string }>; status: string }
interface Draft { id: string; prospectId: string; recipientEmail: string | null; subject: string; body: string; status: string; approvedBy: string | null; approvedAt: string | null; sentAt: string | null }
interface LinkData { summary: { prospects: number; strongProspects: number; awaitingApproval: number; sent: number }; prospects: Prospect[]; drafts: Draft[] }

const inputClass = "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple";

export default function LinkBuildingPage() {
  const domain = useResolvedDomain();
  const [data, setData] = useState<LinkData | null>(null);
  const [competitors, setCompetitors] = useState("");
  const [tab, setTab] = useState<"prospects" | "drafts">("prospects");
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [recipient, setRecipient] = useState("");
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/link-building?site=${encodeURIComponent(domain.id)}`, { signal });
    const body = await response.json();
    if (response.ok) setData(body); else setError(body.error ?? "Link workflow could not be loaded.");
  }, [domain.id]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setSelected(null);
    setError(null);
    void load(controller.signal).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Link workflow could not be loaded.");
    });
    return () => controller.abort();
  }, [load]);

  const discover = async () => {
    setBusy("discover"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/link-building", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteSlug: domain.id, competitors: competitors.split(/\n|,/).map((value) => value.trim()).filter(Boolean) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Link gap scan failed.");
      setNotice("Prospect discovery completed. Existing links were excluded before scoring."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Link gap scan failed."); }
    finally { setBusy(null); }
  };

  const enrich = async () => {
    if (!selected) return;
    setBusy(`contacts:${selected.id}`); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/link-building/prospects/${selected.id}/contacts`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Contact research failed.");
      const emails = (body.contacts ?? []).filter((item: { type?: string }) => item.type === "email");
      setSelected({ ...selected, contacts: body.contacts ?? [] });
      if (emails[0]?.value) setRecipient(emails[0].value);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Contact research failed."); }
    finally { setBusy(null); }
  };

  const createDraft = async () => {
    if (!selected) return;
    setBusy(`draft:${selected.id}`); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/link-building/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prospectId: selected.id, recipientEmail: recipient || null, angle: angle || null }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Draft could not be created.");
      setSelected(null); setRecipient(""); setAngle(""); setTab("drafts");
      if (body.synthetic && body.draft) {
        setData((current) => current ? { ...current, drafts: [body.draft as Draft, ...current.drafts], summary: { ...current.summary, awaitingApproval: current.summary.awaitingApproval + 1 } } : current);
        setNotice("Draft created for review. No message has been sent.");
      } else {
        setNotice("Draft created for review. No message has been sent."); await load();
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Draft could not be created."); }
    finally { setBusy(null); }
  };

  const draftAction = useCallback(async (draft: Draft, action: "approve" | "send") => {
    setBusy(`${action}:${draft.id}`); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/link-building/drafts/${draft.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `${action} failed.`);
      if (body.synthetic && body.draft) {
        setData((current) => current ? {
          ...current,
          drafts: current.drafts.map((item) => item.id === draft.id ? { ...item, ...body.draft } : item),
          summary: { ...current.summary, awaitingApproval: action === "approve" ? Math.max(0, current.summary.awaitingApproval - 1) : current.summary.awaitingApproval, sent: action === "send" ? current.summary.sent + 1 : current.summary.sent },
        } : current);
      } else await load();
      setNotice(action === "approve" ? "Draft approved. Delivery still requires a separate send action." : "Message delivery completed.");
    } catch (err) { setError(err instanceof Error ? err.message : `${action} failed.`); }
    finally { setBusy(null); }
  }, [load]);

  const prospectColumns = useMemo<Column<Prospect>[]>(() => [
    { key: "domain", header: "Prospect", sortValue: (row) => row.sourceDomain, render: (row) => <div><a href={`https://${row.sourceDomain}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-ink hover:text-purple">{row.sourceDomain}<ExternalLink className="h-3 w-3" /></a><div className="mt-0.5 max-w-lg truncate text-2xs text-muted">{row.reason}</div></div> },
    { key: "authority", header: "Authority", align: "right", sortValue: (row) => row.authority ?? 0, render: (row) => row.authority ?? "—" },
    { key: "relevance", header: "Fit score", align: "right", sortValue: (row) => row.relevance, render: (row) => <span className={row.relevance >= 70 ? "font-semibold text-success" : "text-ink"}>{row.relevance}</span> },
    { key: "competitors", header: "Competitor evidence", align: "right", sortValue: (row) => row.competitorHosts.length, render: (row) => row.competitorHosts.length },
    { key: "contact", header: "Contact", render: (row) => <StatusBadge label={row.contacts.some((item) => item.type === "email") ? "Email found" : "Not researched"} tone={row.contacts.some((item) => item.type === "email") ? "success" : "neutral"} /> },
    { key: "action", header: "", align: "right", render: (row) => <Button size="sm" onClick={() => { setSelected(row); setRecipient(row.contacts.find((item) => item.type === "email")?.value ?? ""); }}>Prepare outreach</Button> },
  ], []);
  const draftColumns = useMemo<Column<Draft>[]>(() => [
    { key: "subject", header: "Message", sortValue: (row) => row.subject, render: (row) => <div><div className="font-medium text-ink">{row.subject}</div><div className="mt-0.5 text-2xs text-muted">{row.recipientEmail || "Recipient required"}</div></div> },
    { key: "status", header: "Status", render: (row) => <StatusBadge label={row.status} tone={row.status === "sent" ? "success" : row.status === "approved" ? "info" : "warning"} /> },
    { key: "approval", header: "Human approval", render: (row) => row.approvedAt ? <span className="flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" />Approved</span> : <span className="text-xs text-muted">Required</span> },
    { key: "actions", header: "", align: "right", render: (row) => <div className="flex justify-end gap-1">{row.status === "draft" && <Button size="sm" onClick={() => draftAction(row, "approve")} disabled={busy === `approve:${row.id}`}><ShieldCheck className="h-3.5 w-3.5" />Approve</Button>}{row.status === "approved" && <Button size="sm" variant="primary" onClick={() => draftAction(row, "send")} disabled={busy === `send:${row.id}`}><Send className="h-3.5 w-3.5" />Send</Button>}</div> },
  ], [busy, draftAction]);

  return <div className="animate-in space-y-5">
    <PageHeader title="Link building" description="Find domains linking to competitors, research public contacts and prepare one approval-gated message at a time." />
    {notice && <div role="status" className="rounded-md border border-success/20 bg-success/5 p-3 text-xs font-semibold text-success">{notice}</div>}
    {error && <div role="alert" className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical">{error}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><KpiCard label="Prospects" value={String(data?.summary.prospects ?? 0)} accent /><KpiCard label="Strong fit" value={String(data?.summary.strongProspects ?? 0)} /><KpiCard label="Awaiting approval" value={String(data?.summary.awaitingApproval ?? 0)} /><KpiCard label="Sent" value={String(data?.summary.sent ?? 0)} /></div>
    <Card><div className="grid lg:grid-cols-[1fr_auto]"><div className="p-4"><div className="text-xs font-semibold text-ink">Find link gaps</div><p className="mt-1 text-2xs text-muted">Enter competitors that already rank in this market. Existing links to {domain.host} are excluded.</p><div className="mt-3 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" /><input aria-label="Competitor domains for link gap" className={`${inputClass} pl-9`} value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="competitor-one.com, competitor-two.com" /></div><Button variant="primary" onClick={discover} disabled={busy === "discover" || !competitors.trim()}>{busy === "discover" ? "Finding…" : "Find prospects"}</Button></div></div><div className="flex items-center gap-3 border-t border-border bg-workspace/50 px-5 py-4 lg:w-80 lg:border-l lg:border-t-0"><ShieldCheck className="h-5 w-5 shrink-0 text-success" /><p className="text-2xs leading-relaxed text-muted">No outreach is sent until a user reviews and approves the exact recipient and message.</p></div></div></Card>
    <Card><CardHeader title="Outreach desk" subtitle="Evidence and messages stay connected to the originating prospect" action={<Link2 className="h-4 w-4 text-purple" />} /><div className="flex gap-1 border-b border-border px-4 py-2"><button onClick={() => setTab("prospects")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "prospects" ? "bg-purple text-white" : "text-muted hover:bg-workspace"}`}>Prospects ({data?.prospects.length ?? 0})</button><button onClick={() => setTab("drafts")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "drafts" ? "bg-purple text-white" : "text-muted hover:bg-workspace"}`}>Messages ({data?.drafts.length ?? 0})</button></div>{tab === "prospects" ? data?.prospects.length ? <DataTable<Prospect> rows={data.prospects} columns={prospectColumns} searchPlaceholder="Search prospects…" rowKey={(row) => row.id} /> : <div className="p-4"><EmptyState icon={<Link2 className="h-6 w-6" />} title="No link prospects yet" description="Run a link-gap search using at least one competitor." /></div> : data?.drafts.length ? <DataTable<Draft> rows={data.drafts} columns={draftColumns} searchPlaceholder="Search messages…" rowKey={(row) => row.id} /> : <div className="p-4"><EmptyState icon={<Mail className="h-6 w-6" />} title="No outreach drafts" description="Choose a prospect and prepare a message for review." /></div>}</Card>
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Prepare outreach to ${selected.sourceDomain}` : "Prepare outreach"} subtitle="Research first, then create a reviewable draft" footer={<div className="flex justify-end gap-2"><Button onClick={() => setSelected(null)}>Cancel</Button><Button variant="primary" onClick={createDraft} disabled={!selected || busy === `draft:${selected?.id}`}>{busy === `draft:${selected?.id}` ? "Creating…" : "Create draft"}</Button></div>}>
      {selected && <div className="space-y-5"><div className="rounded-md border border-border bg-workspace/50 p-3"><div className="text-xs font-semibold text-ink">Why it is relevant</div><p className="mt-1 text-xs leading-relaxed text-muted">{selected.reason}</p></div><div><div className="flex items-center justify-between"><label className="text-xs font-medium text-ink">Public contact evidence</label><Button size="sm" onClick={enrich} disabled={busy === `contacts:${selected.id}`}><Search className="h-3.5 w-3.5" />{busy === `contacts:${selected.id}` ? "Researching…" : "Research contacts"}</Button></div><div className="mt-2 space-y-1">{selected.contacts.length ? selected.contacts.map((contact, index) => <div key={`${contact.type}:${contact.value}:${index}`} className="rounded bg-workspace px-2.5 py-2 text-xs text-muted">{contact.type?.replace(/_/g, " ")}: {contact.value}</div>) : <p className="text-2xs text-muted">No contact research has been run.</p>}</div></div><label className="block text-xs font-medium text-ink">Recipient email<input className={`mt-1.5 ${inputClass}`} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="editor@example.com" /></label><label className="block text-xs font-medium text-ink">Why your resource belongs<textarea className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-purple" value={angle} onChange={(event) => setAngle(event.target.value)} placeholder="A specific, truthful reason this resource improves their page" /></label><div className="rounded-md border border-warning/25 bg-warning/5 p-3 text-2xs leading-relaxed text-muted">Creating a draft does not send it. The message must be approved separately before the delivery action becomes available.</div></div>}
    </Drawer>
  </div>;
}
