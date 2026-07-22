"use client";

import { useMemo, useState } from "react";
import { Bot, CheckCircle2, Settings2, Sparkles, Target, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { getDomain } from "@/data/domains";
import { percent } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import type { AiPrompt } from "@/lib/types";

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const COLUMNS: Column<AiPrompt>[] = [
  {
    key: "prompt",
    header: "Prompt",
    sortValue: (r) => r.prompt,
    render: (r) => (
      <span className="block max-w-[320px] truncate font-medium text-ink" title={r.prompt}>
        {r.prompt}
      </span>
    ),
  },
  { key: "topic", header: "Topic", sortValue: (r) => r.topic, render: (r) => r.topic },
  {
    key: "mentioned",
    header: "Mentioned",
    sortValue: (r) => r.mentionRate,
    render: (r) => (
      <StatusBadge
        label={r.mentionRate > 0 ? "yes" : "no"}
        tone={r.mentionRate > 0 ? "success" : "neutral"}
      />
    ),
  },
  {
    key: "cited",
    header: "Cited",
    sortValue: (r) => (r.cited ? 1 : 0),
    render: (r) => (
      <StatusBadge label={r.cited ? "yes" : "no"} tone={r.cited ? "success" : "neutral"} />
    ),
  },
  {
    key: "lastChecked",
    header: "Last checked",
    align: "right",
    sortValue: (r) => r.lastChecked,
    render: (r) => <span className="text-xs text-muted">{formatDate(r.lastChecked)}</span>,
  },
];

export default function AiVisibilityPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error } = useLiveDomain(domain.id);
  const [selected, setSelected] = useState<AiPrompt | null>(null);

  const trackedConfig = TRACKED_AI_PROMPTS[domain.id];
  const trackedDomains = useMemo(
    () => Object.keys(TRACKED_AI_PROMPTS).map((id) => getDomain(id)),
    [],
  );

  const ds = bundle?.datasets.ai_prompts;
  const prompts = useMemo(() => ds?.data ?? [], [ds]);

  const kpis = useMemo(
    () => ({
      mentionRate: prompts.length ? avg(prompts.map((p) => p.mentionRate)) : null,
      citationRate: prompts.length ? avg(prompts.map((p) => p.citationRate)) : null,
      tracked: prompts.length,
      citing: prompts.filter((p) => p.cited).length,
    }),
    [prompts],
  );

  const missed = useMemo(() => prompts.filter((p) => !p.cited), [prompts]);

  const header = (
    <PageHeader
      title={`${domain.name} — AI Visibility`}
      description={`How ${domain.host} surfaces in AI assistant answers — real LLM checks against the tracked prompt set, run at each sync.`}
      lastSync={bundle?.lastSync ?? null}
      loading={loading}
    />
  );

  const scopeNote =
    scope === "portfolio" ? (
      <p className="-mt-2 text-2xs text-muted">
        Showing <span className="font-medium text-ink">{domain.name}</span> — AI checks follow the
        domain selected in the rail.
      </p>
    ) : null;

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-in space-y-5">
        {header}
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  // Domain not configured for AI prompt tracking — no checks run, no data exists.
  if (!trackedConfig) {
    return (
      <div className="animate-in space-y-5">
        {header}
        {scopeNote}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
            <div>
              <div className="text-sm font-semibold text-ink">
                AI prompt tracking is not configured for this domain
              </div>
              <p className="mt-1 text-xs text-muted">
                Add prompts in <code className="rounded bg-workspace px-1 py-0.5">src/data/ai-prompts.ts</code>{" "}
                to start measuring. Only configured domains run paid LLM checks during sync, which
                keeps AI spend deliberate. No data is shown here because none has been measured.
              </p>
              <div className="mt-3">
                <div className="text-2xs font-medium uppercase tracking-wide text-muted">
                  Currently tracked domains
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {trackedDomains.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex items-center gap-1 rounded border border-border bg-workspace px-2 py-0.5 text-2xs font-medium text-ink"
                    >
                      <Bot className="h-3 w-3 text-muted" />
                      {d.host}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Tracked, but the first check has not landed yet.
  if (!ds) {
    return (
      <div className="animate-in space-y-5">
        {header}
        {scopeNote}
        <EmptyState
          title="No AI checks recorded yet — tracked prompts run on the monthly AI sync"
          description={`${trackedConfig.length} prompts are configured for ${domain.host}. Measured mention and citation results will appear here after the next sync completes.`}
          icon={<Sparkles className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      {header}
      {scopeNote}

      {/* KPI row — averages of real per-prompt check results */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Brand mention rate"
          value={kpis.mentionRate == null ? "—" : percent(kpis.mentionRate, 0)}
          accent
          hint="Avg across tracked prompts"
        />
        <KpiCard
          label="Citation rate"
          value={kpis.citationRate == null ? "—" : percent(kpis.citationRate, 0)}
          hint="Avg across tracked prompts"
        />
        <KpiCard label="Prompts tracked" value={String(kpis.tracked)} hint="Checked at each sync" />
        <KpiCard
          label="Prompts citing"
          value={String(kpis.citing)}
          hint={`Of ${kpis.tracked} tracked prompts`}
        />
      </div>

      {/* Platform note — honest about current coverage */}
      <Card className="flex items-start gap-3 p-4">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--accent)]" />
        <p className="text-xs text-muted">
          Checks currently run against <span className="font-medium text-ink">ChatGPT (gpt-4o)</span>{" "}
          via DataForSEO. Claude, Gemini and Perplexity endpoints exist and can be enabled later —
          no results are shown for platforms that are not yet being measured.
        </p>
      </Card>

      {/* Prompt table */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Prompt tracking</h3>
          <span className="text-2xs text-muted">Click a row to read the measured response</span>
        </div>
        <DataTable
          rows={prompts}
          columns={COLUMNS}
          searchKeys={(r) => `${r.prompt} ${r.topic}`}
          searchPlaceholder="Search prompts…"
          onRowClick={setSelected}
          exportName={`${domain.id}-ai-prompts`}
          pageSize={12}
          emptyLabel="No prompt checks recorded."
        />
      </Card>

      {/* Missed opportunities */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-ink">Missed opportunities</h3>
          <span className="text-2xs text-muted">Prompts where the last check did not cite the brand</span>
        </div>
        {missed.length === 0 ? (
          <EmptyState
            title="All tracked prompts cite the brand"
            description="Every tracked prompt cited the brand in its most recent check — no coverage gaps."
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {missed.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="rounded-md border border-border p-3 text-left hover:bg-workspace"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-2xs text-muted">{p.topic}</span>
                  <span className="inline-flex items-center rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-[#B9791A]">
                    Coverage gap
                  </span>
                </div>
                <div className="text-sm text-ink">{p.prompt}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Response inspection drawer — only measured facts */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title="AI check detail"
        subtitle={selected?.topic}
        width="max-w-xl"
      >
        {selected && (
          <div>
            <DrawerField label="Prompt">{selected.prompt}</DrawerField>

            <DrawerField label="Measured response (ChatGPT via DataForSEO)">
              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-workspace/60 p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {selected.sampleResponse}
                </p>
              </div>
            </DrawerField>

            <div className="grid grid-cols-2 gap-2">
              <DrawerField label="Brand mentioned">
                {selected.mentionRate > 0 ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" /> Yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
                    <XCircle className="h-4 w-4" /> No
                  </span>
                )}
              </DrawerField>
              <DrawerField label="Brand cited (linked)">
                {selected.cited ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" /> Yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
                    <XCircle className="h-4 w-4" /> No
                  </span>
                )}
              </DrawerField>
            </div>

            <DrawerField label="Last checked">{formatDate(selected.lastChecked)}</DrawerField>

            <p className="mt-3 text-2xs text-muted">
              Verdicts above are from the stored response of the most recent live check. Sentiment,
              recommendation position and competitor mentions are not yet meaningfully measured and
              are therefore not shown.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
