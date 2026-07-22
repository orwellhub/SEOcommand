"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Bot,
  FlaskConical,
  TrendingUp,
  Layers,
  Target,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, StatusBadge, EmptyState } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { SEED } from "@/data/seed";
import { percent, position } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import type { AiPlatform, AiPrompt, Sentiment } from "@/lib/types";

const PLATFORMS: AiPlatform[] = ["chatgpt", "google_ai", "gemini", "perplexity", "claude"];

const PLATFORM_LABEL: Record<AiPlatform, string> = {
  chatgpt: "ChatGPT",
  google_ai: "Google AI",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
};

const SENTIMENT_TONE: Record<Sentiment, "success" | "neutral" | "critical"> = {
  positive: "success",
  neutral: "neutral",
  negative: "critical",
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function PlatformChip({ platform }: { platform: AiPlatform }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-workspace px-1.5 py-0.5 text-2xs font-medium text-muted">
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export default function AiVisibilityPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const [platformFilter, setPlatformFilter] = useState<AiPlatform[]>([]);
  const [selected, setSelected] = useState<AiPrompt | null>(null);

  const prompts = useMemo(() => SEED.aiPrompts[domain.id], [domain.id]);

  const filtered = useMemo(() => {
    if (platformFilter.length === 0) return prompts;
    return prompts.filter((p) => p.platforms.some((pl) => platformFilter.includes(pl)));
  }, [prompts, platformFilter]);

  const kpis = useMemo(() => {
    const positions = prompts.map((p) => p.avgPosition).filter((v): v is number => v != null);
    return {
      mentionRate: avg(prompts.map((p) => p.mentionRate)),
      citationRate: avg(prompts.map((p) => p.citationRate)),
      avgPosition: positions.length ? avg(positions) : null,
      tracked: prompts.length,
    };
  }, [prompts]);

  const shareOfVoice = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of prompts) {
      for (const host of p.competitorsMentioned) {
        counts.set(host, (counts.get(host) ?? 0) + 1);
      }
    }
    const rows = [...counts.entries()].map(([host, count]) => ({ host, count }));
    rows.sort((a, b) => b.count - a.count);
    const max = rows.length ? rows[0]!.count : 0;
    return { rows, max };
  }, [prompts]);

  const missed = useMemo(() => prompts.filter((p) => !p.cited), [prompts]);

  const clusters = useMemo(() => {
    const map = new Map<string, AiPrompt[]>();
    for (const p of prompts) {
      const arr = map.get(p.topic) ?? [];
      arr.push(p);
      map.set(p.topic, arr);
    }
    return [...map.entries()]
      .map(([topic, items]) => ({
        topic,
        count: items.length,
        avgMention: avg(items.map((i) => i.mentionRate)),
      }))
      .sort((a, b) => b.count - a.count);
  }, [prompts]);

  const columns: Column<AiPrompt>[] = [
    {
      key: "prompt",
      header: "Prompt",
      sortValue: (r) => r.prompt,
      render: (r) => (
        <span className="block max-w-[280px] truncate font-medium text-ink" title={r.prompt}>
          {r.prompt}
        </span>
      ),
    },
    { key: "topic", header: "Topic", sortValue: (r) => r.topic, render: (r) => r.topic },
    {
      key: "platforms",
      header: "Platforms",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.platforms.map((pl) => (
            <PlatformChip key={pl} platform={pl} />
          ))}
        </div>
      ),
    },
    {
      key: "mentionRate",
      header: "Mention",
      align: "right",
      sortValue: (r) => r.mentionRate,
      render: (r) => percent(r.mentionRate, 0),
    },
    {
      key: "citationRate",
      header: "Citation",
      align: "right",
      sortValue: (r) => r.citationRate,
      render: (r) => percent(r.citationRate, 0),
    },
    {
      key: "avgPosition",
      header: "Rec. pos.",
      align: "right",
      sortValue: (r) => r.avgPosition ?? 999,
      render: (r) => position(r.avgPosition),
    },
    {
      key: "sentiment",
      header: "Sentiment",
      sortValue: (r) => r.sentiment,
      render: (r) => <StatusBadge label={r.sentiment} tone={SENTIMENT_TONE[r.sentiment]} />,
    },
    {
      key: "cited",
      header: "Cited",
      sortValue: (r) => (r.cited ? 1 : 0),
      render: (r) =>
        r.cited ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <XCircle className="h-3.5 w-3.5" /> No
          </span>
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

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={`${domain.name} — AI Visibility`}
        description={`How ${domain.host} surfaces across AI assistants — brand mentions, citations and recommendation position for tracked prompts.`}
      />

      {scope === "portfolio" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-workspace/60 px-3 py-2 text-2xs text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the
          domain selected in the rail. Switch domains there to change scope.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Brand mention rate"
          value={percent(kpis.mentionRate, 0)}
          accent
          hint="Avg across tracked prompts"
        />
        <KpiCard label="Citation rate" value={percent(kpis.citationRate, 0)} hint="Avg linked-source rate" />
        <KpiCard
          label="Avg recommendation position"
          value={kpis.avgPosition == null ? "—" : kpis.avgPosition.toFixed(1)}
          invertDelta
          hint="Where cited among recommendations"
        />
        <KpiCard label="Prompts tracked" value={String(kpis.tracked)} hint="Across all platforms" />
      </div>

      {/* Platform filter */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[color:var(--accent)]" />
            <h3 className="text-sm font-semibold text-ink">Platform coverage</h3>
          </div>
          {platformFilter.length > 0 && (
            <button
              onClick={() => setPlatformFilter([])}
              className="text-2xs font-medium text-muted hover:text-ink"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((pl) => {
            const active = platformFilter.includes(pl);
            return (
              <button
                key={pl}
                onClick={() =>
                  setPlatformFilter((prev) =>
                    prev.includes(pl) ? prev.filter((x) => x !== pl) : [...prev, pl],
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-transparent bg-[color:var(--accent)] text-white"
                    : "border-border bg-card text-muted hover:bg-workspace hover:text-ink",
                )}
              >
                <Bot className="h-3.5 w-3.5" />
                {PLATFORM_LABEL[pl]}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-2xs text-muted">
          These are prepared platforms — coverage is subject to provider availability and
          per-platform API access. Selecting one or more chips filters the prompt table below.
        </p>
      </Card>

      {/* Prompt tracking table */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Prompt tracking</h3>
          <span className="text-2xs text-muted">Click a row to inspect the sampled response</span>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(r) => `${r.prompt} ${r.topic}`}
          searchPlaceholder="Search prompts…"
          onRowClick={setSelected}
          exportName={`${domain.id}-ai-prompts`}
          pageSize={12}
          emptyLabel="No prompts match the selected platforms."
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Share of voice */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Competitor share of voice"
            subtitle="How often each competitor is mentioned across tracked prompts"
          />
          <div className="p-4">
            {shareOfVoice.rows.length === 0 ? (
              <EmptyState
                title="No competitors surfaced"
                description="No competing hosts were mentioned across the sampled AI responses."
                icon={<TrendingUp className="h-5 w-5" />}
              />
            ) : (
              <div className="space-y-2.5">
                {shareOfVoice.rows.map((r, i) => (
                  <div key={r.host} className="flex items-center gap-3">
                    <span className="w-5 text-2xs font-semibold text-muted tnum">{i + 1}</span>
                    <span className="w-40 shrink-0 truncate text-sm text-ink" title={r.host}>
                      {r.host}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-workspace">
                      <div
                        className="h-full rounded-full bg-[color:var(--accent)]"
                        style={{ width: `${(r.count / shareOfVoice.max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs font-medium text-ink tnum">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Topic clusters */}
        <Card>
          <CardHeader title="Topic clusters" subtitle="Prompts grouped by topic" />
          <div className="divide-y divide-border">
            {clusters.map((c) => (
              <div key={c.topic} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-muted" />
                  <span className="text-sm text-ink">{c.topic}</span>
                </div>
                <div className="flex items-center gap-3 text-2xs text-muted">
                  <span className="tnum">
                    {c.count} {c.count === 1 ? "prompt" : "prompts"}
                  </span>
                  <span className="font-medium text-ink tnum">{percent(c.avgMention, 0)} mention</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Missed-opportunity prompts */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-ink">Missed-opportunity prompts</h3>
        </div>
        {missed.length === 0 ? (
          <EmptyState
            title="Full citation coverage"
            description="Every tracked prompt currently cites this brand — no coverage gaps to close."
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

      {/* Response inspection drawer */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title="AI response inspection"
        subtitle={selected?.topic}
        width="max-w-xl"
      >
        {selected && (
          <div>
            <DrawerField label="Prompt">{selected.prompt}</DrawerField>
            <DrawerField label="Platforms tracked">
              <div className="flex flex-wrap gap-1">
                {selected.platforms.map((pl) => (
                  <PlatformChip key={pl} platform={pl} />
                ))}
              </div>
            </DrawerField>
            <DrawerField label="Sampled response">
              <p className="text-sm leading-relaxed text-muted">{selected.sampleResponse}</p>
            </DrawerField>
            <DrawerField label="Competitors mentioned">
              {selected.competitorsMentioned.length === 0 ? (
                <span className="text-xs text-muted">None mentioned in the sampled response.</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {selected.competitorsMentioned.map((host) => (
                    <span
                      key={host}
                      className="inline-flex items-center rounded border border-border bg-workspace px-1.5 py-0.5 text-2xs font-medium text-muted"
                    >
                      {host}
                    </span>
                  ))}
                </div>
              )}
            </DrawerField>

            {/* Measured facts */}
            <div className="mt-4 rounded-md border border-border bg-workspace/50 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-success" />
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink">
                  Measured (API)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xs text-muted">Mention rate</div>
                  <div className="text-sm font-semibold text-ink tnum">
                    {percent(selected.mentionRate, 0)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted">Citation rate</div>
                  <div className="text-sm font-semibold text-ink tnum">
                    {percent(selected.citationRate, 0)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted">Recommendation position</div>
                  <div className="text-sm font-semibold text-ink tnum">
                    {position(selected.avgPosition)}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-muted">Sentiment</div>
                  <div className="mt-0.5">
                    <StatusBadge
                      label={selected.sentiment}
                      tone={SENTIMENT_TONE[selected.sentiment]}
                    />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-2xs text-muted">
                Facts above are stored provider measurements from the last check on{" "}
                {formatDate(selected.lastChecked)}.
              </p>
            </div>

            {/* Inferred recommendation */}
            <div className="mt-3 rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                <span className="text-2xs font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                  Inferred recommendation
                </span>
              </div>
              <p className="text-sm leading-relaxed text-ink">
                {selected.cited
                  ? "Reinforce the pages this prompt already cites with fresher statistics and structured data to defend recommendation position against competitors."
                  : "Publish an authoritative answer targeting this prompt — a concise, well-sourced explainer with schema markup — to close the citation gap and earn a mention."}
              </p>
              <p className="mt-2 text-2xs text-muted">
                AI-generated guidance, not a measured metric. Validate against the stored data above
                before acting.
              </p>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
