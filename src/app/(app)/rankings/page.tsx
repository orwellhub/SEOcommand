"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Monitor,
  Smartphone,
  Layers,
  MapPin,
  Trophy,
  TrendingDown,
  Sparkles,
  GitFork,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { AreaTrend, BarSeries } from "@/components/charts/charts";
import { SEED } from "@/data/seed";
import { domainMetrics, winnersLosers } from "@/data/metrics";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { fullNumber } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Device, RankSnapshot, SerpFeature } from "@/lib/types";

type DeviceFilter = Device | "all";
type RankRow = RankSnapshot & { delta: number };

const DEVICE_OPTIONS: { value: DeviceFilter; label: string; icon: typeof Monitor }[] = [
  { value: "all", label: "All", icon: Layers },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "mobile", label: "Mobile", icon: Smartphone },
];

function formatFeature(f: string): string {
  return f.replace(/_/g, " ");
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium capitalize",
        tone === "accent"
          ? "border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
          : "border-border bg-workspace text-muted",
      )}
    >
      {label}
    </span>
  );
}

function DeltaCell({ delta }: { delta: number }) {
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const tone = delta > 0 ? "text-success" : delta < 0 ? "text-critical" : "text-muted";
  return (
    <span className={cn("inline-flex items-center justify-end gap-0.5 font-medium tnum", tone)}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(delta)}
    </span>
  );
}

export default function RankingsPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const [device, setDevice] = useState<DeviceFilter>("all");
  const [selected, setSelected] = useState<RankRow | null>(null);

  const metrics = useMemo(() => domainMetrics(domain.id), [domain.id]);

  const allSnapshots = SEED.rankSnapshots[domain.id];
  const buckets = SEED.positionBuckets[domain.id];
  const visibility = SEED.visibility[domain.id];
  const movers = useMemo(() => winnersLosers(domain.id), [domain.id]);

  // Device-filtered snapshots drive the table, KPIs, SERP ownership & cannibalisation.
  const rows = useMemo<RankRow[]>(
    () =>
      allSnapshots
        .filter((s) => device === "all" || s.device === device)
        .map((s) => ({ ...s, delta: s.prevPosition - s.position })),
    [allSnapshots, device],
  );

  const kpis = useMemo(() => {
    const tracked = rows.length;
    const avgPosition = tracked
      ? rows.reduce((sum, r) => sum + r.position, 0) / tracked
      : 0;
    const top3 = rows.filter((r) => r.position <= 3).length;
    const top10 = rows.filter((r) => r.position <= 10).length;
    return { tracked, avgPosition, top3, top10 };
  }, [rows]);

  const visSeries = useMemo(
    () => visibility.map((v) => ({ date: v.date, value: v.value })),
    [visibility],
  );

  // Map named-interface buckets to anonymous objects for the chart's index-signature prop.
  const bucketData = useMemo(
    () => buckets.map((b) => ({ label: b.label, count: b.count, prevCount: b.prevCount })),
    [buckets],
  );

  // SERP-feature ownership — counts across the (filtered) snapshots.
  const featureCounts = useMemo(() => {
    const counts = new Map<SerpFeature, number>();
    for (const r of rows) {
      for (const f of r.serpFeatures) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const maxFeatureCount = featureCounts.length ? featureCounts[0]![1] : 0;

  // Cannibalisation — (a) multiple keywords targeting one URL, (b) different URLs
  // whose keyword tokens overlap heavily.
  const cannibalisation = useMemo(() => {
    const sameUrl: { url: string; keywords: string[] }[] = [];
    const byUrl = new Map<string, RankRow[]>();
    for (const r of rows) {
      if (!r.url) continue;
      const arr = byUrl.get(r.url) ?? [];
      arr.push(r);
      byUrl.set(r.url, arr);
    }
    for (const [url, arr] of byUrl) {
      if (arr.length > 1) sameUrl.push({ url, keywords: arr.map((a) => a.keyword) });
    }

    const tokenize = (s: string) =>
      new Set(
        s
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 4),
      );
    const tokenClash: { a: string; b: string; shared: string[] }[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const ri = rows[i]!;
        const rj = rows[j]!;
        if (!ri.url || !rj.url || ri.url === rj.url) continue;
        const ti = tokenize(ri.keyword);
        const shared = [...tokenize(rj.keyword)].filter((t) => ti.has(t));
        if (shared.length >= 2) tokenClash.push({ a: ri.keyword, b: rj.keyword, shared });
      }
    }
    return { sameUrl, tokenClash: tokenClash.slice(0, 6) };
  }, [rows]);
  const hasCannibalisation =
    cannibalisation.sameUrl.length > 0 || cannibalisation.tokenClash.length > 0;

  const columns: Column<RankRow>[] = [
    {
      key: "keyword",
      header: "Keyword",
      sortValue: (r) => r.keyword,
      render: (r) => <span className="font-medium text-ink">{r.keyword}</span>,
    },
    {
      key: "position",
      header: "Pos",
      align: "right",
      sortValue: (r) => r.position,
      render: (r) => r.position,
    },
    {
      key: "prevPosition",
      header: "Prev",
      align: "right",
      sortValue: (r) => r.prevPosition,
      render: (r) => <span className="text-muted">{r.prevPosition}</span>,
    },
    {
      key: "delta",
      header: "Δ",
      align: "right",
      sortValue: (r) => r.delta,
      render: (r) => <DeltaCell delta={r.delta} />,
    },
    {
      key: "device",
      header: "Device",
      sortValue: (r) => r.device,
      render: (r) => (
        <span className="inline-flex items-center gap-1 capitalize text-muted">
          {r.device === "mobile" ? (
            <Smartphone className="h-3.5 w-3.5" />
          ) : (
            <Monitor className="h-3.5 w-3.5" />
          )}
          {r.device}
        </span>
      ),
    },
    {
      key: "volume",
      header: "Volume",
      align: "right",
      sortValue: (r) => r.volume,
      render: (r) => fullNumber(r.volume),
    },
    {
      key: "serpFeatures",
      header: "SERP features",
      sortValue: (r) => r.serpFeatures.length,
      render: (r) =>
        r.serpFeatures.length ? (
          <div className="flex flex-wrap gap-1">
            {r.serpFeatures.slice(0, 3).map((f) => (
              <Chip key={f} label={formatFeature(f)} />
            ))}
            {r.serpFeatures.length > 3 && (
              <span className="text-2xs text-muted">+{r.serpFeatures.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "tags",
      header: "Tags",
      sortValue: (r) => r.tags.join(","),
      render: (r) =>
        r.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {r.tags.map((t) => (
              <Chip key={t} label={t} tone="accent" />
            ))}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Rankings"
        description="Keyword position tracking, visibility trend and SERP-feature ownership, reconstructed from immutable rank snapshots."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted">
              <MapPin className="h-3.5 w-3.5 text-[color:var(--accent)]" />
              {domain.primaryMarket}
            </span>
            <div className="flex rounded-md border border-border bg-workspace p-0.5">
              {DEVICE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = device === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDevice(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium",
                      active ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the
          domain rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Tracked keywords" value={fullNumber(kpis.tracked)} hint={`${device} device`} />
        <KpiCard
          label="Avg position"
          value={kpis.avgPosition ? kpis.avgPosition.toFixed(1) : "—"}
          accent
          hint="Mean across tracked set"
        />
        <KpiCard label="Keywords in top 3" value={fullNumber(kpis.top3)} hint="Positions 1–3" />
        <KpiCard label="Keywords in top 10" value={fullNumber(kpis.top10)} hint="Positions 1–10" />
        <KpiCard
          label="Share of voice"
          value={`${metrics.visibility}%`}
          delta={metrics.visibilityDeltaPct}
          hint="Visibility index"
        />
      </div>

      {/* Position distribution + visibility trend */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Position distribution"
            subtitle="Tracked keywords grouped by ranking bucket — current vs previous"
          />
          <div className="px-3 pb-3 pt-4">
            <BarSeries data={bucketData} xKey="label" yKey="count" />
            <div className="mt-3 grid grid-cols-5 gap-2 px-1">
              {buckets.map((b) => {
                const shift = b.count - b.prevCount;
                return (
                  <div key={b.label} className="rounded-md border border-border px-2 py-1.5 text-center">
                    <div className="text-2xs font-medium text-muted">{b.label}</div>
                    <div className="mt-0.5 text-sm font-semibold text-ink tnum">{b.count}</div>
                    <div
                      className={cn(
                        "text-2xs tnum",
                        shift > 0 ? "text-success" : shift < 0 ? "text-critical" : "text-muted",
                      )}
                    >
                      {b.prevCount} → {b.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Visibility trend"
            subtitle="Search visibility index over the last 90 days"
          />
          <div className="px-3 pb-3 pt-4">
            <AreaTrend data={visSeries} dataKey="value" color="var(--accent)" />
          </div>
        </Card>
      </div>

      {/* Winners & losers */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold text-ink">Ranking winners</h3>
          </div>
          {movers.winners.length ? (
            <div className="space-y-1.5">
              {movers.winners.map((m) => (
                <div
                  key={m.keywordId}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-workspace"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{m.keyword}</div>
                    <div className="text-2xs text-muted tnum">Vol {fullNumber(m.volume)}</div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-xs text-muted tnum">
                      {m.prevPosition} → {m.position}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-success tnum">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      {m.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No gains this period" description="No keywords improved position." />
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-critical" />
            <h3 className="text-sm font-semibold text-ink">Ranking losers</h3>
          </div>
          {movers.losers.length ? (
            <div className="space-y-1.5">
              {movers.losers.map((m) => (
                <div
                  key={m.keywordId}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-workspace"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{m.keyword}</div>
                    <div className="text-2xs text-muted tnum">Vol {fullNumber(m.volume)}</div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-xs text-muted tnum">
                      {m.prevPosition} → {m.position}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-critical tnum">
                      <ArrowDownRight className="h-3.5 w-3.5" />
                      {Math.abs(m.delta)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No losses this period" description="No keywords dropped position." />
          )}
        </Card>
      </div>

      {/* SERP-feature ownership + cannibalisation */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader
            title="SERP-feature ownership"
            subtitle="Features present on tracked keyword results"
            action={<Sparkles className="h-4 w-4 text-[color:var(--accent)]" />}
          />
          {featureCounts.length ? (
            <div className="divide-y divide-border">
              {featureCounts.map(([feature, count]) => (
                <div key={feature} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm capitalize text-ink">{formatFeature(feature)}</span>
                    <span className="text-xs font-semibold text-ink tnum">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-workspace">
                    <div
                      className="h-full rounded-full bg-[color:var(--accent)]"
                      style={{ width: `${maxFeatureCount ? (count / maxFeatureCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No SERP features"
                description="No SERP features detected on the current keyword set."
              />
            </div>
          )}
        </Card>

        <Card className="p-4 xl:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <GitFork className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-ink">Cannibalisation</h3>
          </div>
          {hasCannibalisation ? (
            <div className="space-y-2.5">
              {cannibalisation.sameUrl.map((c) => (
                <div key={c.url} className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <div className="text-2xs font-medium uppercase tracking-wide text-[#B9791A]">
                    Shared target URL
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{c.url}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.keywords.map((k) => (
                      <Chip key={k} label={k} tone="accent" />
                    ))}
                  </div>
                </div>
              ))}
              {cannibalisation.tokenClash.map((c) => (
                <div
                  key={`${c.a}|${c.b}`}
                  className="rounded-md border border-border p-3"
                >
                  <div className="text-2xs font-medium uppercase tracking-wide text-muted">
                    Overlapping intent — distinct URLs
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-ink">
                    <span className="truncate">{c.a}</span>
                    <span className="text-muted">↔</span>
                    <span className="truncate">{c.b}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.shared.map((t) => (
                      <Chip key={t} label={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No cannibalisation detected"
              description="No two tracked keywords compete on the same URL or share heavily overlapping intent."
            />
          )}
        </Card>
      </div>

      {/* Position tracking table */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Position tracking</h3>
          <span className="text-2xs text-muted">Row → snapshot detail</span>
        </div>
        {rows.length ? (
          <DataTable
            rows={rows}
            columns={columns}
            searchKeys={(r) => `${r.keyword} ${r.tags.join(" ")} ${r.serpFeatures.join(" ")}`}
            searchPlaceholder="Search keywords, tags, features…"
            onRowClick={setSelected}
            exportName={`${domain.id}-rankings`}
            pageSize={12}
          />
        ) : (
          <EmptyState
            title="No tracked keywords"
            description={`No ${device} snapshots for ${domain.name}.`}
          />
        )}
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.keyword ?? ""}
        subtitle={selected ? `${domain.name} · ${selected.location}` : undefined}
      >
        {selected && (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border p-2.5 text-center">
                <div className="text-2xs uppercase tracking-wide text-muted">Position</div>
                <div className="mt-0.5 text-lg font-semibold text-ink tnum">{selected.position}</div>
              </div>
              <div className="rounded-md border border-border p-2.5 text-center">
                <div className="text-2xs uppercase tracking-wide text-muted">Previous</div>
                <div className="mt-0.5 text-lg font-semibold text-muted tnum">
                  {selected.prevPosition}
                </div>
              </div>
              <div className="rounded-md border border-border p-2.5 text-center">
                <div className="text-2xs uppercase tracking-wide text-muted">Delta</div>
                <div className="mt-0.5 flex justify-center text-lg">
                  <DeltaCell delta={selected.delta} />
                </div>
              </div>
            </div>

            <dl className="mt-2 divide-y divide-border">
              <DrawerField label="Device">
                <span className="capitalize">{selected.device}</span>
              </DrawerField>
              <DrawerField label="Search volume">{fullNumber(selected.volume)}</DrawerField>
              <DrawerField label="Snapshot date">{formatDate(selected.date)}</DrawerField>
              <DrawerField label="Ranking URL">
                {selected.url ? (
                  <span className="break-all text-[color:var(--accent)]">{selected.url}</span>
                ) : (
                  <span className="text-muted">Not mapped</span>
                )}
              </DrawerField>
              <DrawerField label="SERP features">
                {selected.serpFeatures.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.serpFeatures.map((f) => (
                      <Chip key={f} label={formatFeature(f)} />
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </DrawerField>
              <DrawerField label="Tags">
                {selected.tags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((t) => (
                      <Chip key={t} label={t} tone="accent" />
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </DrawerField>
            </dl>

            <p className="mt-3 rounded-md border border-dashed border-border bg-workspace/50 px-3 py-2 text-2xs text-muted">
              History is reconstructed from immutable rank snapshots — previous position reflects the
              prior captured snapshot, not a mutable running record.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
