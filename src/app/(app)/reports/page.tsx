"use client";

import { useMemo, useState } from "react";
import { FileText, CalendarClock, Download, FileDown, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, StatusBadge, EmptyState, Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { SEED } from "@/data/seed";
import { DOMAINS, getDomain } from "@/data/domains";
import { formatDate } from "@/lib/dates";
import { useDomain } from "@/components/shell/domain-context";
import type { DomainId, ReportSchedule, ReportTemplate } from "@/lib/types";

function cadenceTone(cadence: ReportSchedule["cadence"]): "success" | "info" | "neutral" {
  switch (cadence) {
    case "daily":
      return "info";
    case "weekly":
      return "success";
    default:
      return "neutral";
  }
}

function domainLabel(id: DomainId | "portfolio"): string {
  return id === "portfolio" ? "Portfolio (all domains)" : getDomain(id).name;
}

function truncateRecipients(recipients: string[], max = 2): string {
  if (recipients.length <= max) return recipients.join(", ");
  return `${recipients.slice(0, max).join(", ")} +${recipients.length - max}`;
}

const CADENCE_OPTIONS: ReportSchedule["cadence"][] = ["daily", "weekly", "monthly"];

export default function ReportsPage() {
  const { activeDomain } = useDomain();

  const templates = SEED.reportTemplates;
  const schedules = SEED.schedules;

  const [previewTemplate, setPreviewTemplate] = useState<ReportTemplate | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<ReportSchedule | null>(null);

  // Custom report builder — purely local state, no persistence.
  const [builderName, setBuilderName] = useState("");
  const [builderSections, setBuilderSections] = useState<string[]>([]);
  const [builderCadence, setBuilderCadence] = useState<ReportSchedule["cadence"]>("weekly");
  const [builderRecipients, setBuilderRecipients] = useState("");
  const [builderSaved, setBuilderSaved] = useState(false);

  const sectionOptions = useMemo(
    () => Array.from(new Set(templates.flatMap((t) => t.sections))),
    [templates],
  );

  const kpis = useMemo(() => {
    const delivered = schedules.filter((s) => s.lastDelivered !== null).length;
    const nextRun = schedules.reduce<string | null>((earliest, s) => {
      if (!earliest || s.nextRun < earliest) return s.nextRun;
      return earliest;
    }, null);
    return {
      templates: templates.length,
      scheduled: schedules.length,
      delivered,
      nextRun,
    };
  }, [templates, schedules]);

  const columns: Column<ReportSchedule>[] = [
    {
      key: "templateName",
      header: "Report",
      sortValue: (r) => r.templateName,
      render: (r) => <span className="font-medium text-ink">{r.templateName}</span>,
    },
    {
      key: "domain",
      header: "Scope",
      sortValue: (r) => domainLabel(r.domainId),
      render: (r) => <span className="text-muted">{domainLabel(r.domainId)}</span>,
    },
    {
      key: "cadence",
      header: "Cadence",
      width: "104px",
      sortValue: (r) => r.cadence,
      render: (r) => <StatusBadge label={r.cadence} tone={cadenceTone(r.cadence)} />,
    },
    {
      key: "format",
      header: "Format",
      width: "96px",
      sortValue: (r) => r.format,
      render: (r) => <span className="text-xs text-muted">{r.format}</span>,
    },
    {
      key: "recipients",
      header: "Recipients",
      sortValue: (r) => r.recipients.join(", "),
      render: (r) => (
        <span className="block max-w-[200px] truncate text-xs text-muted" title={r.recipients.join(", ")}>
          {truncateRecipients(r.recipients)}
        </span>
      ),
    },
    {
      key: "nextRun",
      header: "Next run",
      align: "right",
      width: "128px",
      sortValue: (r) => r.nextRun,
      render: (r) => <span className="text-muted">{formatDate(r.nextRun)}</span>,
    },
    {
      key: "lastDelivered",
      header: "Last delivered",
      align: "right",
      width: "128px",
      sortValue: (r) => r.lastDelivered ?? "",
      render: (r) => (
        <span className="text-muted">{r.lastDelivered ? formatDate(r.lastDelivered) : "—"}</span>
      ),
    },
  ];

  function toggleSection(section: string) {
    setBuilderSaved(false);
    setBuilderSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section],
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Reports"
        description="Report templates, scheduled delivery and a custom builder — spanning the whole portfolio and every pilot domain."
      />

      {activeDomain && (
        <p className="-mt-2 text-2xs text-muted">
          Reports span every domain. The rail is scoped to{" "}
          <span className="font-medium text-ink">{activeDomain.name}</span>, but this module covers all{" "}
          {DOMAINS.length} pilots plus portfolio-level reporting.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Report templates" value={String(kpis.templates)} hint="Reusable report definitions" />
        <KpiCard label="Scheduled reports" value={String(kpis.scheduled)} hint="Active delivery schedules" />
        <KpiCard label="Delivered (last 30 days)" value={String(kpis.delivered)} hint="Schedules with a delivery" />
        <KpiCard
          label="Next scheduled"
          value={kpis.nextRun ? formatDate(kpis.nextRun) : "—"}
          hint="Earliest upcoming run"
        />
      </div>

      {/* Report templates gallery */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-purple" />
          <h3 className="text-sm font-semibold text-ink">Report templates</h3>
          <span className="text-2xs text-muted">Generate a preview from any template</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col rounded-md border border-border p-3">
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
      </Card>

      {/* Scheduled reports */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-purple" />
          <h3 className="text-sm font-semibold text-ink">Scheduled reports</h3>
          <span className="text-2xs text-muted">Click a row for schedule detail</span>
        </div>
        {schedules.length === 0 ? (
          <EmptyState
            title="No scheduled reports"
            description="Create a schedule from a template to deliver reports automatically."
            icon={<CalendarClock className="h-5 w-5" />}
          />
        ) : (
          <DataTable
            rows={schedules}
            columns={columns}
            searchKeys={(r) => `${r.templateName} ${domainLabel(r.domainId)} ${r.recipients.join(" ")}`}
            onRowClick={setSelectedSchedule}
            exportName="report-schedules"
            pageSize={10}
          />
        )}
      </Card>

      {/* Custom report builder teaser */}
      <Card className="p-4">
        <CardHeader
          title="Custom report builder"
          subtitle="Compose a bespoke report and delivery schedule — local preview only in this demo."
        />
        <div className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="text-2xs font-medium uppercase tracking-wide text-muted">Report name</label>
              <input
                value={builderName}
                onChange={(e) => {
                  setBuilderName(e.target.value);
                  setBuilderSaved(false);
                }}
                placeholder="e.g. Q3 Mortgage Performance"
                className="mt-1 h-8 w-full rounded-md border border-border bg-card px-3 text-xs text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-2xs font-medium uppercase tracking-wide text-muted">Cadence</label>
                <select
                  value={builderCadence}
                  onChange={(e) => {
                    setBuilderCadence(e.target.value as ReportSchedule["cadence"]);
                    setBuilderSaved(false);
                  }}
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
                <label className="text-2xs font-medium uppercase tracking-wide text-muted">Recipients</label>
                <input
                  value={builderRecipients}
                  onChange={(e) => {
                    setBuilderRecipients(e.target.value);
                    setBuilderSaved(false);
                  }}
                  placeholder="team@orwell.io"
                  className="mt-1 h-8 w-full rounded-md border border-border bg-card px-3 text-xs text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-2xs font-medium uppercase tracking-wide text-muted">
              Sections ({builderSections.length} selected)
            </label>
            <div className="mt-1 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border bg-workspace/40 p-2">
              {sectionOptions.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-1.5 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={builderSections.includes(s)}
                    onChange={() => toggleSection(s)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  <span className="truncate">{s}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          {builderSaved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <Send className="h-4 w-4" /> Schedule saved locally (demo) — {builderName || "Untitled report"},{" "}
              {builderCadence}, {builderSections.length} sections
            </span>
          ) : (
            <span className="text-2xs text-muted">
              Builder is visual only — no schedule is persisted and no data leaves this session.
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={builderSections.length === 0}
            onClick={() => setBuilderSaved(true)}
          >
            Save schedule
          </Button>
        </div>
      </Card>

      {/* Template preview drawer */}
      <Drawer
        open={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate?.name ?? ""}
        subtitle={previewTemplate ? `${previewTemplate.type} report · preview` : undefined}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs text-muted">PDF / CSV export</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled>
                <Download className="h-3.5 w-3.5" /> Export PDF
              </Button>
              <Button variant="secondary" size="sm" disabled>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>
        }
      >
        {previewTemplate && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{previewTemplate.description}</p>
            <div>
              <div className="text-2xs font-medium uppercase tracking-wide text-muted">Report outline</div>
              <ol className="mt-2 space-y-1.5">
                {previewTemplate.sections.map((s, i) => (
                  <li key={s} className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple/10 text-2xs font-semibold text-purple tnum">
                      {i + 1}
                    </span>
                    <span className="text-sm text-ink">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <p className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-[#9A6B12]">
              This preview renders demo data. Live figures populate once GA4, Search Console and DataForSEO
              providers are connected.
            </p>
          </div>
        )}
      </Drawer>

      {/* Schedule detail drawer */}
      <Drawer
        open={selectedSchedule !== null}
        onClose={() => setSelectedSchedule(null)}
        title={selectedSchedule?.templateName ?? ""}
        subtitle={selectedSchedule ? domainLabel(selectedSchedule.domainId) : undefined}
      >
        {selectedSchedule && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <StatusBadge label={selectedSchedule.cadence} tone={cadenceTone(selectedSchedule.cadence)} />
              <span className="text-2xs text-muted">{selectedSchedule.format}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DrawerField label="Next run">{formatDate(selectedSchedule.nextRun)}</DrawerField>
              <DrawerField label="Last delivered">
                {selectedSchedule.lastDelivered ? formatDate(selectedSchedule.lastDelivered) : "—"}
              </DrawerField>
            </div>
            <DrawerField label="Scope">{domainLabel(selectedSchedule.domainId)}</DrawerField>
            <DrawerField label={`Recipients (${selectedSchedule.recipients.length})`}>
              <ul className="space-y-1">
                {selectedSchedule.recipients.map((r) => (
                  <li key={r} className="text-xs text-ink">
                    {r}
                  </li>
                ))}
              </ul>
            </DrawerField>
            <DrawerField label="Delivery history">
              <p className="text-xs text-muted">
                {selectedSchedule.lastDelivered
                  ? `Last delivered ${formatDate(selectedSchedule.lastDelivered)}. Full delivery history and audit log activate once live providers are connected.`
                  : "Not yet delivered. The first delivery runs on the next scheduled date."}
              </p>
            </DrawerField>
          </div>
        )}
      </Drawer>
    </div>
  );
}
