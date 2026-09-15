"use client";
import { ReportArchive } from "@/components/reports/report-archive";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Download, FileDown, FileText, Send, Trash2, ArrowRight, Palette } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  StatusBadge,
  EmptyState,
  Skeleton,
  Button,
} from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/drawer";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { DOMAINS } from "@/data/domains";
import type { PortfolioLive } from "@/lib/live";
import { useLivePortfolio } from "@/lib/use-live";
import { fullNumber, percent } from "@/lib/format";
import { relativeFromNow } from "@/lib/dates";
import type { ReportTemplate } from "@/lib/types";
import { useDomain } from "@/components/shell/domain-context";
import { csvCell } from "@/lib/csv";
import { EvidenceMessage } from "@/components/ui/evidence-message";

/* ---------------------------------------------------------------------- */
/* Local types                                                            */
/* ---------------------------------------------------------------------- */

type Cadence = "daily" | "weekly" | "monthly";

const CADENCE_OPTIONS: Cadence[] = ["daily", "weekly", "monthly"];

interface PersistedSchedule {
  id: string;
  templateId: string;
  templateName: string;
  cadence: Cadence;
  recipients: string[];
  nextRun: string;
  lastDelivered: string | null;
  lastError: string | null;
  enabled: boolean;
  scopeType?: "portfolio" | "group" | "site" | "campaign";
  scopeId?: string | null;
  channels?: string[];
}

/* ---------------------------------------------------------------------- */
/* Preview building blocks                                                */
/* ---------------------------------------------------------------------- */

const PAGE_TITLE = "Reports";
const PAGE_DESCRIPTION =
  "Branded client reports, downloadable evidence and persistent delivery schedules.";

export default function ReportsPage() {
  const router = useRouter(), params = useSearchParams();
  const { data: pm, loading, error } = useLivePortfolio();
  const { sites, groups, activeDomain, scope, range } = useDomain();
  const [scopeType, setScopeType] = useState<"portfolio" | "group" | "site" | "campaign">(activeDomain ? "site" : "portfolio");
  const [scopeId, setScopeId] = useState(activeDomain?.id ?? "");
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);

  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null);

  const [draftTemplateId, setDraftTemplateId] = useState<string>(REPORT_TEMPLATES.find(t => t.id === params.get("template"))?.id ?? REPORT_TEMPLATES[0]?.id ?? "");
  const [draftFormat, setDraftFormat] = useState<"PDF" | "CSV" | "PDF+CSV">("PDF");
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string[]>>(() => {
    const t = REPORT_TEMPLATES.find(t => t.id === params.get("template"));
    const selected = t ? params.getAll("section").filter(s => t.sections.includes(s)) : [];
    return t && selected.length ? { [t.id]: [...new Set(selected)] } : {};
  });
  const draftSections = sectionDrafts[draftTemplateId] ?? REPORT_TEMPLATES.find(t => t.id === draftTemplateId)?.sections ?? [];
  function updateSections(next: string[]) { setSectionDrafts(s => ({ ...s, [draftTemplateId]: next })); }
  function moveSection(index: number, delta: number) { const next = [...draftSections], to = index + delta; if (to < 0 || to >= next.length) return; [next[index], next[to]] = [next[to]!, next[index]!]; updateSections(next); }
  const [draftCadence, setDraftCadence] = useState<Cadence>("weekly");
  const [draftRecipients, setDraftRecipients] = useState("");
  const [schedules, setSchedules] = useState<PersistedSchedule[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

  useEffect(() => {
    setScopeType(scope === "portfolio" ? "portfolio" : scope.startsWith("group:") ? "group" : "site");
    setScopeId(scope === "portfolio" ? "" : scope.replace(/^group:/, ""));
  }, [scope]);
  useEffect(() => {
    if (!activeDomain) { setCampaignOptions([]); return; }
    fetch(`/api/rank-tracking?site=${encodeURIComponent(activeDomain.id)}`).then((response) => response.json()).then((body: { campaigns?: { id: string; name: string }[] }) => setCampaignOptions(body.campaigns ?? [])).catch(() => setCampaignOptions([]));
  }, [activeDomain]);

  const scopedPm = useMemo<PortfolioLive | null>(() => {
    if (!pm || scopeType === "portfolio") return pm;
    if (!scopeId) return { ...pm, domains: [], totals: { ...pm.totals, domainsSynced: 0, clicks28d: 0, impressions28d: 0, sessions28d: 0, conversions28d: 0, referringDomains: 0, avgHealth: null, avgVisibility: null } };
    let allowed = new Set<string>();
    if (scopeType === "site") allowed.add(scopeId);
    else if (scopeType === "group") {
      const descendants = new Set([scopeId]); let changed = true;
      while (changed) { changed = false; for (const group of groups) if (group.parentId && descendants.has(group.parentId) && !descendants.has(group.id)) { descendants.add(group.id); changed = true; } }
      for (const group of groups) if (descendants.has(group.id)) for (const siteSlug of group.siteSlugs) allowed.add(siteSlug);
    } else if (scopeType === "campaign" && activeDomain) allowed.add(activeDomain.id);
    const domains = pm.domains.filter((domain) => allowed.has(domain.domainId));
    const synced = domains.filter((domain) => domain.lastSync);
    const sum = (key: "clicks28d" | "impressions28d" | "sessions28d" | "conversions28d" | "referringDomains") => domains.reduce((total, domain) => total + (domain[key] ?? 0), 0);
    const avg = (key: "health" | "visibility") => { const values = domains.map((domain) => domain[key]).filter((value): value is number => value != null); return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null; };
    return { ...pm, domains, totals: { ...pm.totals, domainsSynced: synced.length, clicks28d: sum("clicks28d"), impressions28d: sum("impressions28d"), sessions28d: sum("sessions28d"), conversions28d: sum("conversions28d"), referringDomains: sum("referringDomains"), avgHealth: avg("health"), avgVisibility: avg("visibility") } };
  }, [activeDomain, groups, pm, scopeId, scopeType]);

  useEffect(() => {
    let active = true;
    fetch("/api/reports/schedules")
      .then(async (response) => {
        const body = (await response.json()) as { schedules?: PersistedSchedule[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load report schedules.");
        if (active) setSchedules(body.schedules ?? []);
      })
      .catch((err) => {
        if (active) setScheduleError(err instanceof Error ? err.message : "Could not load report schedules.");
      })
      .finally(() => { if (active) setScheduleLoading(false); });
    return () => {
      active = false;
    };
  }, []);

  // Latest sync across the whole portfolio — null when nothing has synced.
  const lastSync = useMemo(() => {
    if (!scopedPm) return null;
    return scopedPm.domains.reduce<string | null>(
      (max, d) => (d.lastSync && (!max || d.lastSync > max) ? d.lastSync : max),
      null,
    );
  }, [scopedPm]);

  async function saveSchedule() {
    const recipients = draftRecipients
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (scopeType !== "portfolio" && !scopeId) { setScheduleError("Choose a website, folder or campaign for this report."); return; }
    if (recipients.length === 0 || recipients.some((recipient) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))) {
      setScheduleError("Enter valid recipient email addresses, separated by commas.");
      return;
    }
    setSaving(true);
    setScheduleError(null); setScheduleNotice(null);
    try {
      const response = await fetch("/api/reports/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: draftTemplateId, cadence: draftCadence, recipients, format: draftFormat, scopeType, scopeId: scopeType === "portfolio" ? null : scopeId, definition: { documentVersion: "client-report-v3", days: parseInt(range), branding: scopeType === "site" ? "website" : "portfolio", sections: draftSections } }),
      });
      const body = (await response.json()) as { schedule?: PersistedSchedule; error?: string };
      if (!response.ok || !body.schedule) throw new Error(body.error || "Could not save the schedule.");
      setSchedules((prev) => [body.schedule!, ...prev]);
      setDraftRecipients("");
      setScheduleNotice("Delivery schedule saved.");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(id: string) {
    setScheduleError(null); setScheduleNotice(null); setDeleting(id);
    try {
      const response = await fetch(`/api/reports/schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete the schedule.");
      setSchedules((prev) => prev.filter((schedule) => schedule.id !== id));
      setScheduleNotice("Delivery schedule removed.");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not delete the schedule.");
    } finally { setDeleting(null); }
  }

  function downloadCsv() {
    if (previewTemplate) { window.open(previewUrl(previewTemplate) + "&format=csv", "_blank", "noopener,noreferrer"); return; }
    const header = ["Domain", "Clicks 28d", "Impressions 28d", "Sessions 28d", "Conversions 28d", "Health", "Visibility"];
    const rows = scopedPm?.domains.map((row) => {
      const domain = sites.find((candidate) => candidate.id === row.domainId) ?? DOMAINS.find((candidate) => candidate.id === row.domainId);
      return [domain?.name ?? row.domainId, row.clicks28d, row.impressions28d, row.sessions28d, row.conversions28d, row.health, row.visibility];
    }) ?? [];
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orwell-seo-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function previewUrl(template: ReportTemplate) {
    return `/api/reports/preview?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}&template=${template.id}&days=${parseInt(range)}`;
  }
  function printReport() {
    if (previewTemplate) window.open(previewUrl(previewTemplate), "_blank", "noopener,noreferrer");
  }

  if (loading && !pm) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} lastSync={null} loading />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (error && !pm) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} lastSync={null} />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  if (!pm) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} lastSync={null} />
        <EmptyState
          title="No portfolio data available"
          description="No saved performance data is available yet. Connect a website and collect its first results."
        />
      </div>
    );
  }

    const reportData = scopedPm ?? pm;
  const scopeLabel = scopeType === "portfolio" ? "Portfolio" : scopeType === "group" ? groups.find((group) => group.id === scopeId)?.name ?? "Folder" : scopeType === "site" ? sites.find((site) => site.id === scopeId)?.name ?? "Website" : campaignOptions.find((campaign) => campaign.id === scopeId)?.name ?? "Campaign";
  const reportSite = scopeType === "site" ? sites.find((site) => site.id === scopeId) : null;
  const scopedSchedules = schedules.filter((schedule) => scopeType === "portfolio" || (schedule.scopeType === scopeType && schedule.scopeId === scopeId));

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={PAGE_TITLE}
        description={`${PAGE_DESCRIPTION} Current reporting scope: ${scopeLabel}.`}
        lastSync={lastSync}
        loading={loading}
        actions={<details className="relative"><summary className="cursor-pointer rounded-md border border-border px-3 py-2 text-xs font-semibold">Report options</summary><div className="mt-2 flex flex-wrap items-center gap-2"><select aria-label="Report coverage" value={scopeType} onChange={(event) => { const next = event.target.value as typeof scopeType; setScopeType(next); setScopeId(next === "site" ? activeDomain?.id ?? "" : ""); }} className="h-9 rounded-md border border-border bg-card px-3 text-xs font-bold text-ink"><option value="portfolio">Portfolio</option><option value="group">Folder</option><option value="site">Website</option><option value="campaign" disabled={!activeDomain}>Campaign</option></select>{scopeType !== "portfolio" && <select aria-label="Report website, folder or campaign" value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="h-9 max-w-56 rounded-md border border-border bg-card px-3 text-xs font-bold text-ink"><option value="">Choose {scopeType === "group" ? "a folder" : scopeType === "site" ? "a website" : "a campaign"}</option>{(scopeType === "group" ? groups : scopeType === "site" ? sites : campaignOptions).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div></details>}
      />

      <section id="report-archive" className="scroll-mt-6"><ReportArchive /></section>
      <Card className="relative overflow-hidden border-0 bg-[#11182B] text-white">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: `linear-gradient(180deg, ${reportSite?.accent ?? "#335CFF"}, #12B8C4)` }} />
        <div className="grid gap-7 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:p-8">
          <div><div className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-white/45">Client reporting studio</div><h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold leading-tight tracking-tight">Turn live SEO evidence into a report a client can understand and act on.</h2><p className="mt-3 max-w-2xl text-xs leading-5 text-white/60">Every website can carry its own logo, colours, prepared-by identity and footer. Reports combine narrative, period comparisons, trend charts, ranking movement, crawl risk, links, AI visibility and next actions.</p><div className="mt-5 flex flex-wrap gap-2">{reportSite ? <><Button variant="primary" onClick={() => router.push(`/reports/client?site=${reportSite.id}&template=tpl-domain`)}>Open full client report <ArrowRight className="h-4 w-4" /></Button><Button onClick={() => router.push(`/sites/${reportSite.id}/settings?tab=reporting`)}><Palette className="h-4 w-4" />Customise branding</Button></> : <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">Select a website in the top bar to create a white-label client report.</div>}</div></div>
          <div className="relative hidden min-h-44 overflow-hidden rounded-md bg-[#F7F8FB] p-5 text-[#11182B] shadow-2xl lg:block"><div className="h-1 w-16" style={{ background: reportSite?.accent ?? "#335CFF" }} /><div className="mt-8 text-[12px] font-extrabold uppercase tracking-[0.18em] text-[#7B8498]">Monthly performance</div><div className="mt-2 font-serif text-2xl font-bold">{reportSite?.name ?? "Client website"}</div><div className="mt-7 grid grid-cols-3 gap-2">{["Search", "Technical", "Actions"].map((label, index) => <div key={label} className="border-t-2 bg-white p-2 text-[12px] font-bold" style={{ borderColor: index === 1 ? "#12B8C4" : reportSite?.accent ?? "#335CFF" }}>{label}<div className="mt-2 h-1.5 rounded bg-[#E6E9F0]" /></div>)}</div></div>
        </div>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Report templates"
          value={String(REPORT_TEMPLATES.length)}
          hint="Reusable report definitions"
        />
        <KpiCard
          label="Domains with live data"
          value={String(reportData.totals.domainsSynced)}
          hint={`Of ${scopeType === "portfolio" ? sites.length : reportData.domains.length} in scope`}
        />
        <KpiCard
          label="Scheduled reports"
          value={scheduleLoading || scheduleError ? "—" : String(scopedSchedules.filter((schedule) => schedule.enabled).length)}
          hint="Saved schedules in this report’s scope"
        />
        <KpiCard
          label="Last data refresh"
          value={lastSync ? relativeFromNow(lastSync) : "never"}
          hint="Latest saved snapshot in this report’s scope"
        />
      </div>

      {/* Template gallery */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-purple" />
          <h3 className="text-sm font-semibold text-ink">Report templates</h3>
          <span className="text-2xs text-muted">
            “Generate” previews a report against the live portfolio snapshot
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_TEMPLATES.map((t, templateIndex) => (
            <div key={t.id} className="relative flex flex-col overflow-hidden rounded-lg border border-border p-4 shadow-card">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: ["#335CFF", "#12B8C4", "#FF6B5E", "#7137F5", "#16A879"][templateIndex % 5] }} />
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="text-sm font-semibold text-ink">{t.name}</div>
                <StatusBadge label={t.type} tone="info" />
              </div>
              <p className="text-xs text-muted">{t.description}</p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {t.sections.map((s) => (
                  <span
                    key={s}
                    className="rounded border border-border bg-workspace px-1.5 py-0.5 text-[12px] text-muted"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => reportSite ? router.push(`/reports/client?site=${reportSite.id}&template=${t.id}`) : setPreviewTemplate(t)}>
                  <FileDown className="h-3.5 w-3.5" /> {reportSite ? "Generate report" : "Preview"}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {reportData.totals.domainsSynced === 0 && (
          <p className="mt-3 text-2xs text-muted">
            No domain has synced yet — previews will show every section as “no data yet” until the
            first scheduled sync stores live datasets.
          </p>
        )}
      </Card>

      {/* Scheduling */}
      <section id="schedule" className="scroll-mt-6"><Card className="p-4">
        <CardHeader
          title="Scheduled delivery"
          subtitle="Automatically deliver reports after the daily data refresh"
        />
        <div className="space-y-4 pt-4">
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-workspace/40 p-3">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />
            <p className="text-xs text-muted">
              Reports use saved data from the daily refresh at 06:00 UTC. Email delivery must be configured
              by your administrator before scheduled reports can be sent. Your schedules remain saved
              while delivery is being set up.
            </p>
          </div>

          {/* Persisted schedule form */}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
            <div>
              <label htmlFor="report-template" className="text-2xs font-medium uppercase tracking-wide text-muted">
                Template
              </label>
              <select
                id="report-template"
                value={draftTemplateId}
                onChange={(e) => setDraftTemplateId(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-ink focus:outline-none focus-visible:outline-2"
              >
                {REPORT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="report-cadence" className="text-2xs font-medium uppercase tracking-wide text-muted">
                Cadence
              </label>
              <select
                id="report-cadence"
                value={draftCadence}
                onChange={(e) => setDraftCadence(e.target.value as Cadence)}
                className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-xs capitalize text-ink focus:outline-none focus-visible:outline-2"
              >
                {CADENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="report-recipients" className="text-2xs font-medium uppercase tracking-wide text-muted">
                Recipients
              </label>
              <input
                id="report-recipients"
                value={draftRecipients}
                onChange={(e) => setDraftRecipients(e.target.value)}
                placeholder="team@orwell.io, cc@orwell.io"
                className="mt-1 h-8 w-full rounded-md border border-border bg-card px-3 text-xs text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2"
              />
            </div>
            <Button variant="primary" size="sm" onClick={saveSchedule} disabled={saving}>
              <Send className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save schedule"}
            </Button>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-center gap-3 text-xs font-semibold">Attachment format<select aria-label="Report attachment format" value={draftFormat} onChange={e => setDraftFormat(e.target.value as typeof draftFormat)} className="rounded border border-border bg-card p-2"><option>PDF</option><option>CSV</option><option>PDF+CSV</option></select></label>
            <details><summary className="cursor-pointer text-xs font-semibold">Report sections and order · {draftSections.length} selected · {parseInt(range)} days</summary><div className="mt-3 space-y-2">{draftSections.map((section, i) => <div key={section} className="flex items-center gap-2 text-xs"><span className="mr-auto">{i+1}. {section}</span><Button size="sm" disabled={!i} aria-label={`Move ${section} up`} onClick={() => moveSection(i,-1)}>↑</Button><Button size="sm" disabled={i===draftSections.length-1} aria-label={`Move ${section} down`} onClick={() => moveSection(i,1)}>↓</Button><Button size="sm" disabled={draftSections.length===1} onClick={() => updateSections(draftSections.filter(s=>s!==section))}>Remove</Button></div>)}{REPORT_TEMPLATES.find(t=>t.id===draftTemplateId)?.sections.filter(s=>!draftSections.includes(s)).map(s=><Button key={s} size="sm" onClick={()=>updateSections([...draftSections,s])}>Add {s}</Button>)}</div></details>
          </div>
          {scheduleError && <div role="alert"><EvidenceMessage detail={scheduleError} /></div>}
          {scheduleNotice && <p role="status" className="text-sm text-success">{scheduleNotice}</p>}

          {scheduleLoading ? <p role="status" className="text-sm text-muted">Loading delivery schedules…</p> : scheduleError && schedules.length === 0 ? null : scopedSchedules.length === 0 ? (
            <p className="text-2xs text-muted">
              No delivery schedules saved for this scope yet.
            </p>
          ) : (
            <div className="space-y-2">
              {scopedSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-ink">{schedule.templateName}</span>
                    <StatusBadge label={schedule.cadence} tone="info" />
                    <StatusBadge label={schedule.scopeType ?? (schedule.scopeId ? "site" : "portfolio")} tone="neutral" />
                    <span className="truncate text-2xs text-muted">
                      {schedule.recipients.join(", ")}
                    </span>
                    <span className="text-2xs text-muted">Next: {new Date(schedule.nextRun).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={schedule.lastError ? "delivery error" : schedule.lastDelivered ? "delivered" : "scheduled"}
                      tone={schedule.lastError ? "critical" : schedule.lastDelivered ? "success" : "neutral"}
                    />
                    <Button variant="ghost" size="sm" disabled={deleting !== null} onClick={() => deleteSchedule(schedule.id)} aria-label={`Delete ${schedule.templateName}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      </section>

      {/* Report preview drawer */}
      <Drawer
        open={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate?.name ?? ""}
        subtitle={
          previewTemplate
            ? `${previewTemplate.type} report · live-data preview${lastSync ? ` · data as of ${relativeFromNow(lastSync)}` : " · awaiting first sync"}`
            : undefined
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-2xs text-muted">Open the report, then choose Print / Save as PDF in your browser.</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={printReport}>
                <Download className="h-3.5 w-3.5" /> Print / PDF
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadCsv}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>
        }
      >
        {previewTemplate && <iframe title="Report PDF preview" src={previewUrl(previewTemplate)} className="h-[70vh] w-full rounded border border-border" />}

      </Drawer>
    </div>
  );
}
