"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Crosshair,
  Trophy,
  TrendingDown,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { AreaTrend, BarSeries } from "@/components/charts/charts";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { compactNumber, fullNumber } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { GscMover, RankSnapshot } from "@/lib/types";

type RankRow = RankSnapshot & { delta: number };

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

function MoverRow({ mover, tone }: { mover: GscMover; tone: "success" | "critical" }) {
  const Icon = tone === "success" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-workspace">
      <div className="min-w-0">
        <div className="truncate text-sm text-ink" title={mover.key}>
          {mover.key}
        </div>
        <div className="text-2xs text-muted tnum">
          {fullNumber(mover.clicksBefore)} → {fullNumber(mover.clicksNow)} clicks
        </div>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 text-xs font-medium tnum",
          tone === "success" ? "text-success" : "text-critical",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {mover.change > 0 ? "+" : ""}
        {fullNumber(mover.change)}
      </span>
    </div>
  );
}

const RANK_COLUMNS: Column<RankRow>[] = [
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
    key: "volume",
    header: "Volume",
    align: "right",
    sortValue: (r) => r.volume,
    render: (r) => fullNumber(r.volume),
  },
  {
    key: "url",
    header: "URL",
    sortValue: (r) => r.url,
    render: (r) =>
      r.url ? (
        <span className="block max-w-[280px] truncate text-muted" title={r.url}>
          {r.url}
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
];

export default function RankingsPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error } = useLiveDomain(domain.id);
  const [selected, setSelected] = useState<RankRow | null>(null);

  const ds = bundle?.datasets;
  const keywords = ds?.keywords?.data ?? null;
  const snapshots = ds?.rank_snapshots?.data ?? null;
  const buckets = ds?.position_buckets?.data ?? null;
  const visibility = ds?.visibility_series?.data ?? null;
  const gscTotals = ds?.gsc_totals?.data ?? null;
  const striking = ds?.striking_distance?.data ?? null;
  const movers = ds?.gsc_movers?.data ?? null;

  const rows = useMemo<RankRow[]>(
    () =>
      (bundle?.datasets.rank_snapshots?.data ?? []).map((s) => ({
        ...s,
        delta: s.prevPosition - s.position,
      })),
    [bundle],
  );

  const kpis = useMemo(() => {
    const snaps = bundle?.datasets.rank_snapshots?.data ?? null;
    if (!snaps || snaps.length === 0) return { avgPosition: null, top3: null, top10: null };
    const avgPosition = snaps.reduce((sum, s) => sum + s.position, 0) / snaps.length;
    return {
      avgPosition,
      top3: snaps.filter((s) => s.position <= 3).length,
      top10: snaps.filter((s) => s.position <= 10).length,
    };
  }, [bundle]);

  const bucketData = useMemo(
    () =>
      (bundle?.datasets.position_buckets?.data ?? []).map((b) => ({
        label: b.label,
        count: b.count,
      })),
    [bundle],
  );

  const positionTrend = useMemo(
    () =>
      (bundle?.datasets.gsc_timeseries?.data ?? []).map((p) => ({
        date: p.date,
        position: p.position,
        clicks: p.clicks,
      })),
    [bundle],
  );

  const visSeries = useMemo(
    () =>
      (bundle?.datasets.visibility_series?.data ?? []).map((v) => ({
        date: v.date,
        value: v.value,
      })),
    [bundle],
  );

  const strikingRows = useMemo(
    () =>
      [...(bundle?.datasets.striking_distance?.data ?? [])].sort(
        (a, b) => b.impressions - a.impressions,
      ),
    [bundle],
  );

  const strikingColumns = useMemo<Column<(typeof strikingRows)[number]>[]>(
    () => [
      {
        key: "query",
        header: "Query",
        sortValue: (r) => r.query,
        render: (r) => <span className="font-medium text-ink">{r.query}</span>,
      },
      {
        key: "position",
        header: "Pos",
        align: "right",
        sortValue: (r) => r.position,
        render: (r) => r.position.toFixed(1),
      },
      {
        key: "impressions",
        header: "Impressions",
        align: "right",
        sortValue: (r) => r.impressions,
        render: (r) => fullNumber(r.impressions),
      },
      {
        key: "clicks",
        header: "Clicks",
        align: "right",
        sortValue: (r) => r.clicks,
        render: (r) => fullNumber(r.clicks),
      },
    ],
    [],
  );

  if (error) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Rankings"
          description={`Keyword positions and measured search trend for ${domain.host}.`}
          lastSync={null}
        />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Rankings"
          description={`Keyword positions and measured search trend for ${domain.host}.`}
          lastSync={null}
          loading
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Rankings"
          description={`Keyword positions and measured search trend for ${domain.host}.`}
          lastSync={null}
          loading={loading}
        />
        <EmptyState
          title="No live data yet"
          description="Nothing has been synced for this domain — datasets populate on the next scheduled sync."
        />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Rankings"
        description={`Keyword positions, measured search trend and page-one opportunities for ${domain.host}.`}
        lastSync={bundle.lastSync ?? null}
        loading={loading}
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the
          domain rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Tracked keywords"
          value={keywords ? fullNumber(keywords.length) : "—"}
          hint="DataForSEO ranked keywords"
        />
        <KpiCard
          label="Avg position"
          value={kpis.avgPosition != null ? kpis.avgPosition.toFixed(1) : "—"}
          accent
          hint="Mean across rank snapshots"
        />
        <KpiCard
          label="Keywords in top 3"
          value={kpis.top3 != null ? fullNumber(kpis.top3) : "—"}
          hint="Positions 1–3"
        />
        <KpiCard
          label="Keywords in top 10"
          value={kpis.top10 != null ? fullNumber(kpis.top10) : "—"}
          hint="Positions 1–10"
        />
        <KpiCard
          label="GSC avg position"
          value={gscTotals ? gscTotals.position.toFixed(1) : "—"}
          hint="Measured, last 28 days"
        />
      </div>

      {/* Position distribution + visibility */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Position distribution"
            subtitle="Tracked keywords grouped by ranking bucket"
          />
          <div className="px-3 pb-3 pt-4">
            {buckets && buckets.length > 0 ? (
              <BarSeries data={bucketData} xKey="label" yKey="count" />
            ) : (
              <EmptyState
                title="No position buckets"
                description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Visibility"
            subtitle="Visibility index — accumulates one point per sync day"
          />
          <div className="px-3 pb-3 pt-4">
            {visibility && visibility.length >= 2 ? (
              <AreaTrend data={visSeries} dataKey="value" color="var(--accent)" />
            ) : visibility && visibility.length === 1 ? (
              <div className="rounded-md border border-border bg-workspace/50 px-4 py-8 text-center">
                <div className="text-3xl font-semibold text-ink tnum">
                  {Number.isInteger(visibility[0]!.value)
                    ? fullNumber(visibility[0]!.value)
                    : visibility[0]!.value.toFixed(1)}
                </div>
                <p className="mt-1 text-2xs text-muted">
                  Visibility index — accumulates daily; a trend line appears after the next sync.
                </p>
              </div>
            ) : (
              <EmptyState
                title="No visibility data"
                description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
              />
            )}
          </div>
        </Card>
      </div>

      {/* Real search trend */}
      <Card>
        <CardHeader
          title="Real search trend"
          subtitle="Measured Search Console daily average position and clicks, last 90 days"
        />
        <div className="px-3 pb-3 pt-4">
          {positionTrend.length >= 2 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <div className="mb-1 px-1 text-2xs font-medium uppercase tracking-wide text-muted">
                  Avg position (lower is better)
                </div>
                <AreaTrend data={positionTrend} dataKey="position" color="#94A3B8" height={200} />
              </div>
              <div>
                <div className="mb-1 px-1 text-2xs font-medium uppercase tracking-wide text-muted">
                  Clicks
                </div>
                <AreaTrend data={positionTrend} dataKey="clicks" color="var(--accent)" height={200} />
              </div>
            </div>
          ) : (
            <EmptyState
              title="No search trend yet"
              description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
            />
          )}
        </div>
      </Card>

      {/* Position tracking table */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Position tracking</h3>
          <span className="text-2xs text-muted">Row → snapshot detail</span>
        </div>
        {snapshots && rows.length > 0 ? (
          <DataTable
            rows={rows}
            columns={RANK_COLUMNS}
            searchKeys={(r) => `${r.keyword} ${r.url}`}
            searchPlaceholder="Search keywords…"
            onRowClick={setSelected}
            exportName={`${domain.id}-rankings`}
            pageSize={12}
          />
        ) : (
          <EmptyState
            title="No keyword data for this domain yet"
            description="Rank snapshots populate on the next scheduled sync."
          />
        )}
      </Card>

      {/* Striking distance */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold text-ink">Striking distance</h3>
          <span className="ml-auto text-2xs text-muted">
            Queries at positions 4–20 — measured GSC data
          </span>
        </div>
        {striking && strikingRows.length > 0 ? (
          <DataTable
            rows={strikingRows}
            columns={strikingColumns}
            searchKeys={(r) => r.query}
            searchPlaceholder="Search queries…"
            exportName={`${domain.id}-striking-distance`}
            pageSize={10}
          />
        ) : (
          <EmptyState
            title="No striking-distance queries"
            description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
          />
        )}
      </Card>

      {/* Winners & losers (measured GSC click movers) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-success" />
            <h3 className="text-sm font-semibold text-ink">Winners</h3>
            <span className="ml-auto text-2xs text-muted">Clicks vs previous 28 days</span>
          </div>
          {movers ? (
            movers.gains.length > 0 ? (
              <div className="space-y-1.5">
                {movers.gains.slice(0, 6).map((m) => (
                  <MoverRow key={m.key} mover={m} tone="success" />
                ))}
              </div>
            ) : (
              <EmptyState title="No gains this window" />
            )
          ) : (
            <EmptyState
              title="No mover data"
              description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
            />
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-critical" />
            <h3 className="text-sm font-semibold text-ink">Losers</h3>
            <span className="ml-auto text-2xs text-muted">Clicks vs previous 28 days</span>
          </div>
          {movers ? (
            movers.losses.length > 0 ? (
              <div className="space-y-1.5">
                {movers.losses.slice(0, 6).map((m) => (
                  <MoverRow key={m.key} mover={m} tone="critical" />
                ))}
              </div>
            ) : (
              <EmptyState title="No losses this window" />
            )
          ) : (
            <EmptyState
              title="No mover data"
              description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
            />
          )}
        </Card>
      </div>

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
              <DrawerField label="Search volume">{fullNumber(selected.volume)}</DrawerField>
              <DrawerField label="Snapshot date">{formatDate(selected.date)}</DrawerField>
              <DrawerField label="Device">
                <span className="capitalize">{selected.device}</span>
              </DrawerField>
              <DrawerField label="Location">{selected.location}</DrawerField>
              <DrawerField label="Ranking URL">
                {selected.url ? (
                  <span className="break-all text-[color:var(--accent)]">{selected.url}</span>
                ) : (
                  <span className="text-muted">Not mapped</span>
                )}
              </DrawerField>
            </dl>

            <p className="mt-3 rounded-md border border-dashed border-border bg-workspace/50 px-3 py-2 text-2xs text-muted">
              Positions come from the latest live rank snapshot; previous position reflects the
              prior captured snapshot.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
