"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  TrendingDown,
  Sparkles,
  Copy,
  ExternalLink,
  Lightbulb,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  StatusBadge,
  DeltaPill,
  EmptyState,
  Button,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { SEED } from "@/data/seed";
import { compactNumber, fullNumber } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import type { ContentItem, ContentStatus } from "@/lib/types";

const STATUS_TONE: Record<ContentStatus, "success" | "critical" | "info" | "warning"> = {
  performing: "success",
  decaying: "critical",
  opportunity: "info",
  cannibalising: "warning",
};

const FILTERS: (ContentStatus | "all")[] = [
  "all",
  "performing",
  "decaying",
  "opportunity",
  "cannibalising",
];

const FILTER_LABEL: Record<ContentStatus | "all", string> = {
  all: "All",
  performing: "Performing",
  decaying: "Decaying",
  opportunity: "Opportunity",
  cannibalising: "Cannibalising",
};

export default function ContentIntelligencePage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const [filter, setFilter] = useState<ContentStatus | "all">("all");
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);

  const items = useMemo(() => SEED.content[domain.id], [domain.id]);

  const counts = useMemo(() => {
    const c: Record<ContentStatus, number> = {
      performing: 0,
      decaying: 0,
      opportunity: 0,
      cannibalising: 0,
    };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((it) => it.status === filter)),
    [items, filter],
  );

  const decaying = useMemo(
    () =>
      items
        .filter((it) => it.status === "decaying")
        .sort((a, b) => a.clicksDeltaPct - b.clicksDeltaPct),
    [items],
  );

  const cannibalGroups = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const it of items) {
      const arr = map.get(it.primaryKeyword) ?? [];
      arr.push(it);
      map.set(it.primaryKeyword, arr);
    }
    return [...map.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([keyword, group]) => ({ keyword, group }));
  }, [items]);

  function openItem(it: ContentItem) {
    setBriefOpen(false);
    setSelected(it);
  }

  const columns: Column<ContentItem>[] = [
    {
      key: "title",
      header: "Title",
      sortValue: (r) => r.title,
      render: (r) => (
        <span className="block max-w-[240px] truncate font-medium text-ink" title={r.title}>
          {r.title}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge label={r.status} tone={STATUS_TONE[r.status]} />,
    },
    {
      key: "primaryKeyword",
      header: "Primary keyword",
      sortValue: (r) => r.primaryKeyword,
      render: (r) => <span className="text-muted">{r.primaryKeyword}</span>,
    },
    {
      key: "clicks",
      header: "Clicks",
      align: "right",
      sortValue: (r) => r.clicks,
      render: (r) => fullNumber(r.clicks),
    },
    {
      key: "clicksDeltaPct",
      header: "Δ Clicks",
      align: "right",
      sortValue: (r) => r.clicksDeltaPct,
      render: (r) => <DeltaPill value={r.clicksDeltaPct} />,
    },
    {
      key: "impressions",
      header: "Impressions",
      align: "right",
      sortValue: (r) => r.impressions,
      render: (r) => compactNumber(r.impressions),
    },
    {
      key: "avgPosition",
      header: "Avg pos.",
      align: "right",
      sortValue: (r) => r.avgPosition,
      render: (r) => r.avgPosition.toFixed(1),
    },
    {
      key: "words",
      header: "Words",
      align: "right",
      sortValue: (r) => r.words,
      render: (r) => fullNumber(r.words),
    },
    {
      key: "lastUpdated",
      header: "Updated",
      align: "right",
      sortValue: (r) => r.lastUpdated,
      render: (r) => <span className="text-xs text-muted">{formatDate(r.lastUpdated)}</span>,
    },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={`${domain.name} — Content Intelligence`}
        description={`Content inventory for ${domain.host} — performance, decay, opportunities and keyword cannibalisation across tracked pages.`}
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
        <KpiCard label="Pages tracked" value={String(items.length)} accent hint="Total in inventory" />
        <KpiCard
          label="Decaying pages"
          value={String(counts.decaying)}
          hint="Organic clicks declining"
        />
        <KpiCard
          label="Opportunities"
          value={String(counts.opportunity)}
          hint="Ranking just off page one"
        />
        <KpiCard
          label="Cannibalising"
          value={String(counts.cannibalising)}
          hint="Competing for one term"
        />
      </div>

      {/* Content inventory */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Content inventory</h3>
          <div className="flex flex-wrap rounded-md border border-border bg-workspace p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {FILTER_LABEL[f]}
                {f !== "all" && (
                  <span className="ml-1 text-2xs text-muted tnum">({counts[f]})</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          searchKeys={(r) => `${r.title} ${r.primaryKeyword}`}
          searchPlaceholder="Search pages…"
          onRowClick={openItem}
          exportName={`${domain.id}-content`}
          pageSize={12}
          emptyLabel="No pages match the selected status."
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Content decay */}
        <Card>
          <CardHeader
            title="Content decay"
            subtitle="Decaying pages, ranked by steepest click decline"
          />
          <div className="p-4">
            {decaying.length === 0 ? (
              <EmptyState
                title="No decaying pages"
                description="No tracked page is currently flagged as decaying."
                icon={<TrendingDown className="h-5 w-5" />}
              />
            ) : (
              <div className="space-y-1.5">
                {decaying.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => openItem(it)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-workspace"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-ink">{it.title}</div>
                      <div className="truncate text-2xs text-muted">{it.primaryKeyword}</div>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="text-2xs text-muted tnum">
                        {fullNumber(it.clicks)} clicks
                      </span>
                      <DeltaPill value={it.clicksDeltaPct} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Cannibalisation */}
        <Card>
          <CardHeader
            title="Cannibalisation"
            subtitle="Multiple pages competing for the same primary keyword"
          />
          <div className="p-4">
            {cannibalGroups.length === 0 ? (
              <EmptyState
                title="No cannibalisation detected"
                description="Each primary keyword maps to a single tracked page."
                icon={<Copy className="h-5 w-5" />}
              />
            ) : (
              <div className="space-y-3">
                {cannibalGroups.map(({ keyword, group }) => (
                  <div key={keyword} className="rounded-md border border-warning/25 bg-warning/5 p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{keyword}</span>
                      <span className="inline-flex items-center rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-[#B9791A]">
                        {group.length} competing URLs
                      </span>
                    </div>
                    <div className="space-y-1">
                      {group.map((it) => (
                        <button
                          key={it.id}
                          onClick={() => openItem(it)}
                          className="flex w-full items-center justify-between gap-2 text-left text-2xs text-muted hover:text-ink"
                        >
                          <span className="truncate">{it.url}</span>
                          <span className="whitespace-nowrap tnum">pos {it.avgPosition.toFixed(1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Detail drawer */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Content detail"}
        subtitle={selected?.primaryKeyword}
        width="max-w-xl"
      >
        {selected && (
          <div>
            <DrawerField label="Status">
              <StatusBadge label={selected.status} tone={STATUS_TONE[selected.status]} />
            </DrawerField>
            <DrawerField label="URL">
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all text-[color:var(--accent)] hover:underline"
              >
                {selected.url}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            </DrawerField>

            <div className="mt-2 grid grid-cols-2 gap-3 rounded-md border border-border bg-workspace/50 p-3">
              <div>
                <div className="text-2xs text-muted">Clicks</div>
                <div className="text-sm font-semibold text-ink tnum">{fullNumber(selected.clicks)}</div>
              </div>
              <div>
                <div className="text-2xs text-muted">Clicks change</div>
                <div className="mt-0.5">
                  <DeltaPill value={selected.clicksDeltaPct} />
                </div>
              </div>
              <div>
                <div className="text-2xs text-muted">Impressions</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {fullNumber(selected.impressions)}
                </div>
              </div>
              <div>
                <div className="text-2xs text-muted">Avg position</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {selected.avgPosition.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-2xs text-muted">Word count</div>
                <div className="text-sm font-semibold text-ink tnum">{fullNumber(selected.words)}</div>
              </div>
              <div>
                <div className="text-2xs text-muted">Last updated</div>
                <div className="text-sm font-semibold text-ink">{formatDate(selected.lastUpdated)}</div>
              </div>
            </div>
            <p className="mt-2 text-2xs text-muted">
              Metrics above come from stored provider data (Search Console / analytics).
            </p>

            {/* Recommended action */}
            <div className="mt-4 rounded-md border border-border p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-warning" />
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink">
                  Recommended action
                </span>
              </div>
              <p className="text-sm leading-relaxed text-ink">{selected.opportunity}</p>
            </div>

            {/* Content brief */}
            <div className="mt-3">
              {!briefOpen ? (
                <Button variant="primary" size="sm" onClick={() => setBriefOpen(true)}>
                  <Sparkles className="h-3.5 w-3.5" /> Generate content brief
                </Button>
              ) : (
                <div className="rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                    <span className="text-2xs font-semibold uppercase tracking-wide text-[color:var(--accent)]">
                      AI-generated brief outline
                    </span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-2xs text-muted">Proposed H1</dt>
                      <dd className="text-ink">{selected.title}: The Complete Guide</dd>
                    </div>
                    <div>
                      <dt className="text-2xs text-muted">Target keyword</dt>
                      <dd className="text-ink">{selected.primaryKeyword}</dd>
                    </div>
                    <div>
                      <dt className="text-2xs text-muted">Suggested sections</dt>
                      <dd>
                        <ul className="ml-4 list-disc text-ink">
                          <li>Direct answer / summary (target featured snippet)</li>
                          <li>Key considerations and comparison table</li>
                          <li>Step-by-step guidance</li>
                          <li>FAQ block with schema markup</li>
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-2xs text-muted">Word-count target</dt>
                      <dd className="text-ink tnum">
                        {Math.max(1200, Math.round((selected.words + 600) / 100) * 100)} words
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-2xs text-muted">
                    AI-generated guidance for illustration. Factual SEO metrics above come from
                    stored provider data — validate the brief before commissioning.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
