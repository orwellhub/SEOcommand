"use client";

import { useMemo, useState } from "react";
import {
  Link2,
  ShieldAlert,
  ExternalLink,
  Network,
  TrendingUp,
  Target,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, StatusBadge, EmptyState } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { BarSeries } from "@/components/charts/charts";
import { SEED } from "@/data/seed";
import { orwellAuthorityScore } from "@/data/metrics";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { fullNumber, percent } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Backlink, ReferringDomain } from "@/lib/types";

type SubTab = "backlinks" | "referring" | "newlost" | "anchors" | "risk";

interface AnchorRow {
  anchor: string;
  count: number;
  share: number;
}

const TABS: { key: SubTab; label: string }[] = [
  { key: "backlinks", label: "Backlinks" },
  { key: "referring", label: "Referring domains" },
  { key: "newlost", label: "New & lost" },
  { key: "anchors", label: "Anchors" },
  { key: "risk", label: "Risk review" },
];

/** Tone classes for a 0–100 toxicity value. */
function toxClass(t: number): string {
  if (t >= 70) return "text-critical";
  if (t >= 40) return "text-[#B9791A]";
  return "text-success";
}
function toxBar(t: number): string {
  if (t >= 70) return "bg-critical";
  if (t >= 40) return "bg-warning";
  return "bg-success";
}

function followTone(follow: boolean): "success" | "neutral" {
  return follow ? "success" : "neutral";
}
function statusTone(status: Backlink["status"]): "info" | "success" | "critical" {
  return status === "new" ? "info" : status === "active" ? "success" : "critical";
}

/** Small inline toxicity meter used in tables and the drawer. */
function ToxicityMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-workspace">
        <div className={cn("h-full rounded-full", toxBar(value))} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("text-xs font-medium tnum", toxClass(value))}>{value}</span>
    </div>
  );
}

export default function BacklinksPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const [tab, setTab] = useState<SubTab>("backlinks");
  const [selected, setSelected] = useState<Backlink | null>(null);

  const backlinks = SEED.backlinks[domain.id];
  const referringDomains = SEED.referringDomains[domain.id];
  const competitors = SEED.competitors[domain.id];

  const authorityScore = useMemo(() => orwellAuthorityScore(domain.id), [domain.id]);

  const counts = useMemo(() => {
    const newCount = backlinks.filter((b) => b.status === "new").length;
    const lostCount = backlinks.filter((b) => b.status === "lost").length;
    return { newCount, lostCount };
  }, [backlinks]);

  // Recompute the transparent score components for the explainer bars.
  const scoreComponents = useMemo(() => {
    const vis = SEED.visibility[domain.id];
    const visNow = vis[vis.length - 1]!.value;
    const avgAuthority =
      referringDomains.reduce((s, r) => s + r.authority, 0) / referringDomains.length;
    const avgRelevance =
      referringDomains.reduce((s, r) => s + r.topicalRelevance, 0) / referringDomains.length;
    const uniqueHosts = new Set(backlinks.map((b) => b.sourceDomain)).size;
    const diversity = Math.min(100, (uniqueHosts / 15) * 100);
    const avgToxicity = backlinks.reduce((s, b) => s + b.toxicity, 0) / backlinks.length;
    return [
      { label: "Referring-domain authority", weight: 35, value: Math.round(avgAuthority), penalty: false },
      { label: "Topical relevance", weight: 20, value: Math.round(avgRelevance), penalty: false },
      { label: "Link diversity", weight: 15, value: Math.round(diversity), penalty: false },
      { label: "Organic visibility", weight: 20, value: Math.round(visNow), penalty: false },
      { label: "Toxic-link risk penalty", weight: 10, value: Math.round(avgToxicity), penalty: true },
    ];
  }, [domain.id, backlinks, referringDomains]);

  // Authority distribution — referring domains bucketed by authority band.
  const authorityBands = useMemo(() => {
    const bands = [
      { band: "0–20", min: 0, max: 20 },
      { band: "21–40", min: 21, max: 40 },
      { band: "41–60", min: 41, max: 60 },
      { band: "61–80", min: 61, max: 80 },
      { band: "81–100", min: 81, max: 100 },
    ];
    return bands.map((b) => ({
      band: b.band,
      count: referringDomains.filter((r) => r.authority >= b.min && r.authority <= b.max).length,
    }));
  }, [referringDomains]);

  const newLinks = useMemo(() => backlinks.filter((b) => b.status === "new"), [backlinks]);
  const lostLinks = useMemo(() => backlinks.filter((b) => b.status === "lost"), [backlinks]);

  const anchorRows = useMemo<AnchorRow[]>(() => {
    const total = backlinks.length;
    const map = new Map<string, number>();
    for (const b of backlinks) map.set(b.anchor, (map.get(b.anchor) ?? 0) + 1);
    return [...map.entries()]
      .map(([anchor, count]) => ({ anchor, count, share: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [backlinks]);

  const riskLinks = useMemo(
    () => backlinks.filter((b) => b.toxicity > 50).sort((a, b) => b.toxicity - a.toxicity),
    [backlinks],
  );

  // Illustrative link-prospect gap synthesised from the top competitor.
  const linkGap = useMemo(() => {
    const topCompetitor = [...competitors].sort((a, b) => b.authority - a.authority)[0];
    const prospects = [...referringDomains]
      .sort((a, b) => b.authority - a.authority)
      .slice(0, 4);
    return { topCompetitor, prospects };
  }, [competitors, referringDomains]);

  const backlinkCols: Column<Backlink>[] = [
    {
      key: "sourceDomain",
      header: "Source domain",
      sortValue: (r) => r.sourceDomain,
      render: (r) => <span className="font-medium text-ink">{r.sourceDomain}</span>,
    },
    {
      key: "targetUrl",
      header: "Target",
      sortValue: (r) => r.targetUrl,
      render: (r) => (
        <span className="block max-w-[200px] truncate text-muted" title={r.targetUrl}>
          {r.targetUrl.replace(/^https?:\/\//, "")}
        </span>
      ),
    },
    {
      key: "anchor",
      header: "Anchor",
      sortValue: (r) => r.anchor,
      render: (r) => <span className="block max-w-[140px] truncate">{r.anchor}</span>,
    },
    {
      key: "authority",
      header: "Authority",
      align: "right",
      sortValue: (r) => r.authority,
      render: (r) => r.authority,
    },
    {
      key: "follow",
      header: "Link",
      sortValue: (r) => (r.follow ? "follow" : "nofollow"),
      render: (r) => <StatusBadge label={r.follow ? "follow" : "nofollow"} tone={followTone(r.follow)} />,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge label={r.status} tone={statusTone(r.status)} />,
    },
    {
      key: "lastSeen",
      header: "Last seen",
      align: "right",
      sortValue: (r) => r.lastSeen,
      render: (r) => formatDate(r.lastSeen),
    },
  ];

  const referringCols: Column<ReferringDomain>[] = [
    {
      key: "host",
      header: "Host",
      sortValue: (r) => r.host,
      render: (r) => <span className="font-medium text-ink">{r.host}</span>,
    },
    {
      key: "authority",
      header: "Authority",
      align: "right",
      sortValue: (r) => r.authority,
      render: (r) => r.authority,
    },
    {
      key: "backlinks",
      header: "Backlinks",
      align: "right",
      sortValue: (r) => r.backlinks,
      render: (r) => fullNumber(r.backlinks),
    },
    {
      key: "topicalRelevance",
      header: "Relevance",
      align: "right",
      sortValue: (r) => r.topicalRelevance,
      render: (r) => (
        <span className={r.topicalRelevance >= 60 ? "text-success" : "text-muted"}>
          {r.topicalRelevance}
        </span>
      ),
    },
    {
      key: "follow",
      header: "Link",
      sortValue: (r) => (r.follow ? "follow" : "nofollow"),
      render: (r) => <StatusBadge label={r.follow ? "follow" : "nofollow"} tone={followTone(r.follow)} />,
    },
    {
      key: "firstSeen",
      header: "First seen",
      align: "right",
      sortValue: (r) => r.firstSeen,
      render: (r) => formatDate(r.firstSeen),
    },
  ];

  const anchorCols: Column<AnchorRow>[] = [
    {
      key: "anchor",
      header: "Anchor text",
      sortValue: (r) => r.anchor,
      render: (r) => <span className="font-medium text-ink">{r.anchor}</span>,
    },
    {
      key: "count",
      header: "Backlinks",
      align: "right",
      sortValue: (r) => r.count,
      render: (r) => r.count,
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      sortValue: (r) => r.share,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-workspace">
            <div
              className="h-full rounded-full bg-[color:var(--accent)]"
              style={{ width: `${Math.min(100, r.share)}%` }}
            />
          </div>
          <span className="tnum">{percent(r.share)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Backlinks & Authority"
        description="Referring-domain quality, link velocity and toxic-link risk, scored with the transparent Orwell Authority Score."
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the domain rail
          selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Orwell Authority Score" value={String(authorityScore)} accent hint="Transparent 0–100 composite" />
        <KpiCard label="Total backlinks" value={fullNumber(backlinks.length)} hint="Live + historical links" />
        <KpiCard label="Referring domains" value={fullNumber(referringDomains.length)} hint="Unique linking hosts" />
        <KpiCard label="New backlinks" value={String(counts.newCount)} delta={8.5} hint="Discovered recently" />
        <KpiCard label="Lost backlinks" value={String(counts.lostCount)} delta={-4.2} invertDelta hint="Dropped recently" />
      </div>

      {/* Score explainer + authority distribution */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Orwell Authority Score — how it is built"
            subtitle="An original, transparent composite — NOT a copy of any vendor score"
          />
          <div className="p-4">
            <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted">
              An original, transparent 0–100 composite — NOT a copy of any vendor score. Components:
              referring-domain authority (35%), topical relevance (20%), link diversity (15%), organic
              visibility (20%), minus a toxic-link risk penalty (10%). Full method in{" "}
              <span className="font-medium text-ink">docs/scoring-methodology.md</span>.
            </p>
            <div className="space-y-3">
              {scoreComponents.map((c) => (
                <div key={c.label}>
                  <div className="mb-1 flex items-center justify-between text-2xs">
                    <span className="font-medium text-ink">
                      {c.label}
                      {c.penalty && <span className="ml-1 text-critical">(subtractive)</span>}
                    </span>
                    <span className="text-muted tnum">
                      {c.value} · {c.weight}% weight
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-workspace">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.penalty ? "bg-critical/70" : "bg-[color:var(--accent)]",
                      )}
                      style={{ width: `${c.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Authority distribution" subtitle="Referring domains by authority band" />
          <div className="px-3 pb-3 pt-4">
            <BarSeries data={authorityBands} xKey="band" yKey="count" height={220} />
          </div>
        </Card>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-workspace p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "backlinks" && (
        <Card className="p-4">
          <DataTable
            rows={backlinks}
            columns={backlinkCols}
            searchKeys={(r) => `${r.sourceDomain} ${r.anchor} ${r.targetUrl}`}
            searchPlaceholder="Search backlinks…"
            onRowClick={setSelected}
            exportName="backlinks"
            pageSize={12}
          />
        </Card>
      )}

      {tab === "referring" && (
        <Card className="p-4">
          <DataTable
            rows={referringDomains}
            columns={referringCols}
            searchKeys={(r) => r.host}
            searchPlaceholder="Search referring domains…"
            exportName="referring-domains"
            pageSize={12}
          />
        </Card>
      )}

      {tab === "newlost" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="New backlinks"
              subtitle="Recently discovered links"
              action={<StatusBadge label={`${newLinks.length}`} tone="info" />}
            />
            <div className="divide-y divide-border">
              {newLinks.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No new backlinks" description="No links were discovered in the latest window." />
                </div>
              ) : (
                newLinks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelected(b)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-workspace/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{b.sourceDomain}</div>
                      <div className="truncate text-2xs text-muted">{b.anchor}</div>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap text-2xs text-muted">
                      <span className="tnum">DA {b.authority}</span>
                      <span>{formatDate(b.firstSeen)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Lost backlinks"
              subtitle="Links dropped since last crawl"
              action={<StatusBadge label={`${lostLinks.length}`} tone="critical" />}
            />
            <div className="divide-y divide-border">
              {lostLinks.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No lost backlinks" description="No links were lost in the latest window." />
                </div>
              ) : (
                lostLinks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelected(b)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-workspace/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{b.sourceDomain}</div>
                      <div className="truncate text-2xs text-muted">{b.anchor}</div>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap text-2xs text-muted">
                      <span className="tnum">DA {b.authority}</span>
                      <span>{formatDate(b.lastSeen)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === "anchors" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-muted" />
            <h3 className="text-sm font-semibold text-ink">Anchor text distribution</h3>
          </div>
          {anchorRows.length === 0 ? (
            <EmptyState title="No anchors" description="No backlinks are available to aggregate." />
          ) : (
            <DataTable
              rows={anchorRows}
              columns={anchorCols}
              searchKeys={(r) => r.anchor}
              searchPlaceholder="Search anchors…"
              exportName="anchor-distribution"
              pageSize={12}
            />
          )}
        </Card>
      )}

      {tab === "risk" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-critical" />
            <h3 className="text-sm font-semibold text-ink">Toxic-link risk review</h3>
            <span className="text-2xs text-muted">Backlinks with toxicity above 50 — candidates for a disavow review.</span>
          </div>
          {riskLinks.length === 0 ? (
            <EmptyState
              title="No high-risk backlinks"
              description="No links exceed the toxicity threshold of 50. Your link profile is clean."
              icon={<ShieldAlert className="h-5 w-5" />}
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {riskLinks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-workspace/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{b.sourceDomain}</div>
                    <div className="truncate text-2xs text-muted">
                      {b.anchor} · {b.follow ? "follow" : "nofollow"} · review recommended
                    </div>
                  </div>
                  <ToxicityMeter value={b.toxicity} />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Backlink gap / link prospects */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold text-ink">Backlink gap / link prospects</h3>
        </div>
        <p className="mb-3 flex items-start gap-1.5 text-2xs text-muted">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Illustrative gap — high-authority domains that reference your top competitor
          {linkGap.topCompetitor && (
            <span className="font-medium text-ink"> {linkGap.topCompetitor.host}</span>
          )}{" "}
          but do not yet link to {domain.name}.
        </p>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {linkGap.prospects.map((p) => (
            <div key={p.id} className="rounded-md border border-border p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="truncate text-sm font-medium text-ink">{p.host}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
              </div>
              <div className="flex items-center justify-between text-2xs text-muted">
                <span className="tnum">Authority {p.authority}</span>
                <span className="tnum">Relevance {p.topicalRelevance}</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-2xs text-[color:var(--accent)]">
                <TrendingUp className="h-3 w-3" />
                Prospect
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Backlink detail drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.sourceDomain ?? ""}
        subtitle={selected ? `Backlink to ${domain.name}` : undefined}
      >
        {selected && (
          <div>
            {/* Emphasise the target page */}
            <div className="mb-3 rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 p-3">
              <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-[color:var(--accent)]">
                <Link2 className="h-3.5 w-3.5" /> Target page
              </div>
              <a
                href={selected.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-medium text-ink hover:underline"
              >
                {selected.targetUrl}
              </a>
            </div>

            <dl className="divide-y divide-border">
              <DrawerField label="Source page">
                <a
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-purple hover:underline"
                >
                  {selected.sourceUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </DrawerField>
              <DrawerField label="Anchor text">{selected.anchor}</DrawerField>
              <DrawerField label="Source authority">
                <span className="tnum">{selected.authority}</span> / 100
              </DrawerField>
              <DrawerField label="Link type">
                <StatusBadge label={selected.follow ? "follow" : "nofollow"} tone={followTone(selected.follow)} />
              </DrawerField>
              <DrawerField label="Status">
                <StatusBadge label={selected.status} tone={statusTone(selected.status)} />
              </DrawerField>
              <DrawerField label="Toxicity risk">
                <ToxicityMeter value={selected.toxicity} />
                {selected.toxicity > 50 && (
                  <p className="mt-1 text-2xs text-critical">
                    Above threshold — review for disavow.
                  </p>
                )}
              </DrawerField>
              <DrawerField label="First seen">{formatDate(selected.firstSeen)}</DrawerField>
              <DrawerField label="Last seen">{formatDate(selected.lastSeen)}</DrawerField>
            </dl>
          </div>
        )}
      </Drawer>
    </div>
  );
}
