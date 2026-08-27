"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, FileDown, FileText, Send, Trash2 } from "lucide-react";
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

function SectionNoData({ reason }: { reason?: string }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-workspace/50 px-3 py-2 text-xs text-muted">
      {reason ??
        "No data yet — this section populates from per-domain live datasets once a sync has stored them."}
    </p>
  );
}

function PreviewStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink tnum">{value}</div>
      {hint && <div className="mt-0.5 text-2xs text-muted">{hint}</div>}
    </div>
  );
}

/** Domain leaderboard rows for the executive preview — live headlines only. */
function LeaderboardPreview({ pm }: { pm: PortfolioLive }) {
  const rows = pm.domains
    .filter((d) => d.lastSync !== null)
    .map((d) => {
      const meta = DOMAINS.find((x) => x.id === d.domainId);
      return {
        ...d,
        name: meta?.name ?? d.domainId,
        accent: meta?.accent ?? "var(--accent)",
      };
    })
    .sort((a, b) => (b.clicks28d ?? -1) - (a.clicks28d ?? -1));

  if (rows.length === 0) return <SectionNoData />;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[380px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-workspace/70 text-left text-2xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Domain</th>
            <th className="px-3 py-2 text-right">Clicks 28d</th>
            <th className="px-3 py-2 text-right">Sessions 28d</th>
            <th className="px-3 py-2 text-right">Conv. 28d</th>
            <th className="px-3 py-2 text-right">Health</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domainId} className="border-b border-border/70 last:border-0">
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.accent }} />
                  <span className="font-medium text-ink">{r.name}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right text-ink tnum">
                {r.clicks28d == null ? "—" : fullNumber(r.clicks28d)}
              </td>
              <td className="px-3 py-2 text-right text-ink tnum">
                {r.sessions28d == null ? "—" : fullNumber(r.sessions28d)}
              </td>
              <td className="px-3 py-2 text-right text-ink tnum">
                {r.conversions28d == null ? "—" : fullNumber(r.conversions28d)}
              </td>
              <td className="px-3 py-2 text-right text-ink tnum">
                {r.health == null ? "—" : String(r.health)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Render one report section for the preview drawer, filled with REAL numbers
 * from the live portfolio read-model where they exist. Sections whose data is
 * per-domain (not aggregated into PortfolioLive) honestly say "no data yet".
 */
function renderSection(template: ReportTemplate, section: string, pm: PortfolioLive): React.ReactNode {
  const synced = pm.totals.domainsSynced > 0;

  if (template.id === "tpl-exec") {
    switch (section) {
      case "Portfolio KPIs":
        if (!synced) return <SectionNoData />;
        return (
          <div className="grid grid-cols-2 gap-2">
            <PreviewStat label="Organic clicks" value={fullNumber(pm.totals.clicks28d)} hint="28d · GSC" />
            <PreviewStat
              label="Organic sessions"
              value={fullNumber(pm.totals.sessions28d)}
              hint="28d · GA4-mapped domains"
            />
            <PreviewStat
              label="Conversions"
              value={fullNumber(pm.totals.conversions28d)}
              hint="28d · GA4-mapped domains"
            />
            <PreviewStat
              label="Avg site health"
              value={pm.totals.avgHealth == null ? "—" : String(Math.round(pm.totals.avgHealth))}
              hint="Across synced domains"
            />
          </div>
        );
      case "Visibility trend":
        if (pm.totals.avgVisibility == null) return <SectionNoData />;
        return (
          <PreviewStat
            label="Avg visibility index"
            value={percent(pm.totals.avgVisibility)}
            hint="The series accumulates one point per sync day — a trend line appears once ≥2 points exist."
          />
        );
      case "Winners & losers":
        return <LeaderboardPreview pm={pm} />;
      case "Priority actions":
        return (
          <SectionNoData reason="No data yet — priority actions come from per-domain derived recommendations, which are not aggregated into the portfolio read-model." />
        );
    }
  }

  if (template.id === "tpl-tech" && section === "Health score") {
    if (pm.totals.avgHealth == null) return <SectionNoData />;
    return (
      <PreviewStat
        label="Avg health score"
        value={String(Math.round(pm.totals.avgHealth))}
        hint="Portfolio average across synced domains · per-domain breakdown renders on generation"
      />
    );
  }

  if (template.id === "tpl-backlink" && section === "Referring domains") {
    if (!synced) return <SectionNoData />;
    return (
      <PreviewStat
        label="Referring domains"
        value={fullNumber(pm.totals.referringDomains)}
        hint="Portfolio total from the latest sync"
      />
    );
  }

  if (template.id === "tpl-ai" && section === "Mention rate") {
    const tracked = pm.domains.filter((d) => d.aiMentionRate != null);
    if (tracked.length === 0) return <SectionNoData />;
    return (
      <div className="space-y-1.5">
        {tracked.map((d) => {
          const meta = DOMAINS.find((x) => x.id === d.domainId);
          return (
            <div
              key={d.domainId}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-ink">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: meta?.accent ?? "var(--accent)" }}
                />
                {meta?.name ?? d.domainId}
              </span>
              <span className="text-xs text-ink tnum">{percent(d.aiMentionRate as number)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return <SectionNoData />;
}

/* ---------------------------------------------------------------------- */
/* Page                                                                   */
/* ---------------------------------------------------------------------- */

const PAGE_TITLE = "Reports";
const PAGE_DESCRIPTION =
  "Live report previews, downloadable exports and persistent delivery schedules.";

export default function ReportsPage() {
  const { data: pm, loading, error } = useLivePortfolio();
  const { sites, groups, activeDomain } = useDomain();
  const [scopeType, setScopeType] = useState<"portfolio" | "group" | "site" | "campaign">(activeDomain ? "site" : "portfolio");
  const [scopeId, setScopeId] = useState(activeDomain?.id ?? "");
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);

  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null);

  const [draftTemplateId, setDraftTemplateId] = useState<string>(REPORT_TEMPLATES[0]?.id ?? "");
  const [draftCadence, setDraftCadence] = useState<Cadence>("weekly");
  const [draftRecipients, setDraftRecipients] = useState("");
  const [schedules, setSchedules] = useState<PersistedSchedule[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeDomain) return;
    setScopeType("site"); setScopeId(activeDomain.id);
  }, [activeDomain]);
  useEffect(() => {
    if (!activeDomain) { setCampaignOptions([]); return; }
    fetch(`/api/rank-tracking?site=${encodeURIComponent(activeDomain.id)}`).then((response) => response.json()).then((body: { campaigns?: { id: string; name: string }[] }) => setCampaignOptions(body.campaigns ?? [])).catch(() => setCampaignOptions([]));
  }, [activeDomain]);

  const scopedPm = useMemo<PortfolioLive | null>(() => {
    if (!pm || scopeType === "portfolio" || !scopeId) return pm;
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
      });
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
    if (recipients.length === 0) {
      setScheduleError("Add at least one recipient email address.");
      return;
    }
    setSaving(true);
    setScheduleError(null);
    try {
      const response = await fetch("/api/reports/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: draftTemplateId, cadence: draftCadence, recipients, format: "PDF", scopeType, scopeId: scopeType === "portfolio" ? null : scopeId, definition: { sections: REPORT_TEMPLATES.find((template) => template.id === draftTemplateId)?.sections ?? [] } }),
      });
      const body = (await response.json()) as { schedule?: PersistedSchedule; error?: string };
      if (!response.ok || !body.schedule) throw new Error(body.error || "Could not save the schedule.");
      setSchedules((prev) => [body.schedule!, ...prev]);
      setDraftRecipients("");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not save the schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(id: string) {
    setScheduleError(null);
    try {
      const response = await fetch(`/api/reports/schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete the schedule.");
      setSchedules((prev) => prev.filter((schedule) => schedule.id !== id));
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not delete the schedule.");
    }
  }

  function downloadCsv() {
    const header = ["Domain", "Clicks 28d", "Impressions 28d", "Sessions 28d", "Conversions 28d", "Health", "Visibility"];
    const rows = scopedPm?.domains.map((row) => {
      const domain = sites.find((candidate) => candidate.id === row.domainId) ?? DOMAINS.find((candidate) => candidate.id === row.domainId);
      return [domain?.name ?? row.domainId, row.clicks28d, row.impressions28d, row.sessions28d, row.conversions28d, row.health, row.visibility];
    }) ?? [];
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orwell-seo-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    if (!scopedPm || !previewTemplate) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.title = previewTemplate.name;
    const style = printWindow.document.createElement("style");
    style.textContent = "body{font-family:Arial,sans-serif;color:#11182b;padding:32px}h1{margin-bottom:4px}p{color:#5b6474}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #dfe4ec;padding:8px;text-align:right}th:first-child,td:first-child{text-align:left}";
    printWindow.document.head.appendChild(style);
    const title = printWindow.document.createElement("h1");
    title.textContent = previewTemplate.name;
    const meta = printWindow.document.createElement("p");
    meta.textContent = `Generated ${new Date().toLocaleString()} from live portfolio snapshots.`;
    const table = printWindow.document.createElement("table");
    table.innerHTML = "<thead><tr><th>Domain</th><th>Clicks</th><th>Sessions</th><th>Conversions</th><th>Health</th></tr></thead>";
    const body = printWindow.document.createElement("tbody");
    for (const row of scopedPm.domains) {
      const tr = printWindow.document.createElement("tr");
      const values = [sites.find((candidate) => candidate.id === row.domainId)?.name ?? row.domainId, row.clicks28d, row.sessions28d, row.conversions28d, row.health];
      for (const value of values) {
        const td = printWindow.document.createElement("td");
        td.textContent = value == null ? "—" : String(value);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    printWindow.document.body.append(title, meta, table);
    printWindow.focus();
    printWindow.print();
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
          description="The live portfolio read-model returned nothing. Run a sync to populate it."
        />
      </div>
    );
  }

  const reportData = scopedPm ?? pm;
  const scopeLabel = scopeType === "portfolio" ? "Portfolio" : scopeType === "group" ? groups.find((group) => group.id === scopeId)?.name ?? "Folder" : scopeType === "site" ? sites.find((site) => site.id === scopeId)?.name ?? "Website" : campaignOptions.find((campaign) => campaign.id === scopeId)?.name ?? "Campaign";

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={PAGE_TITLE}
        description={`${PAGE_DESCRIPTION} Current reporting scope: ${scopeLabel}.`}
        lastSync={lastSync}
        loading={loading}
        actions={<div className="flex items-center gap-2"><select value={scopeType} onChange={(event) => { const next = event.target.value as typeof scopeType; setScopeType(next); setScopeId(next === "site" ? activeDomain?.id ?? sites[0]?.id ?? "" : next === "group" ? groups[0]?.id ?? "" : next === "campaign" ? campaignOptions[0]?.id ?? "" : ""); }} className="h-9 rounded-md border border-border bg-card px-3 text-xs font-bold text-ink"><option value="portfolio">Portfolio</option><option value="group">Folder</option><option value="site">Website</option><option value="campaign" disabled={!activeDomain}>Campaign</option></select>{scopeType !== "portfolio" && <select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="h-9 max-w-56 rounded-md border border-border bg-card px-3 text-xs font-bold text-ink">{(scopeType === "group" ? groups : scopeType === "site" ? sites : campaignOptions).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div>}
      />

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
          value={String(schedules.filter((schedule) => schedule.enabled).length)}
          hint="Persisted delivery schedules"
        />
        <KpiCard
          label="Last data refresh"
          value={lastSync ? relativeFromNow(lastSync) : "never"}
          hint="Latest provider sync across the portfolio"
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
                    className="rounded border border-border bg-workspace px-1.5 py-0.5 text-[10px] text-muted"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setPreviewTemplate(t)}>
                  <FileDown className="h-3.5 w-3.5" /> Generate
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
      <Card className="p-4">
        <CardHeader
          title="Scheduled delivery"
          subtitle="Schedules persist in Postgres and are handed to your configured delivery webhook"
        />
        <div className="space-y-4 pt-4">
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-workspace/40 p-3">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />
            <p className="text-xs text-muted">
              Reports draw from snapshots refreshed at 06:00 UTC. Due schedules are processed after
              the sync and sent to the configured signed webhook for email delivery. Without a
              webhook, schedules remain saved and visible but are not sent.
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

          {scheduleError && (
            <p role="alert" className="rounded-md border border-critical/20 bg-critical/10 px-3 py-2 text-xs text-critical">
              {scheduleError}
            </p>
          )}

          {schedules.length === 0 ? (
            <p className="text-2xs text-muted">
              No delivery schedules saved yet.
            </p>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => (
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
                    <Button variant="ghost" size="sm" onClick={() => deleteSchedule(schedule.id)} aria-label={`Delete ${schedule.templateName}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

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
            <span className="text-2xs text-muted">Print opens the browser’s Save as PDF flow.</span>
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
        {previewTemplate && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{previewTemplate.description}</p>
            {previewTemplate.sections.map((s, i) => (
              <div key={s}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple/10 text-2xs font-semibold text-purple tnum">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-ink">{s}</span>
                </div>
                {renderSection(previewTemplate, s, reportData)}
              </div>
            ))}
            <p className="text-2xs text-muted">
              Preview numbers come from the live portfolio read-model — nothing is estimated.
              Per-domain sections render in full when reports are generated against a domain
              bundle.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
