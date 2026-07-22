"use client";

import { useMemo, useState } from "react";
import { Search, Users, GitCompareArrows, ListChecks, Target, Plus, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, StatusBadge, EmptyState, Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { Sparkline } from "@/components/charts/sparkline";
import { SEED } from "@/data/seed";
import { compactNumber, fullNumber, currency, position as fmtPosition } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import type {
  Keyword,
  Competitor,
  SearchIntent,
  SerpFeature,
} from "@/lib/types";

/* ------------------------------- helpers -------------------------------- */

type SubTab = "explorer" | "competitors" | "gap" | "lists";

const INTENT_TONE: Record<SearchIntent, "success" | "info" | "warning" | "neutral"> = {
  transactional: "success",
  commercial: "info",
  informational: "neutral",
  navigational: "warning",
};

const SERP_LABEL: Record<SerpFeature, string> = {
  featured_snippet: "Snippet",
  people_also_ask: "PAA",
  local_pack: "Local",
  image_pack: "Images",
  video: "Video",
  sitelinks: "Sitelinks",
  reviews: "Reviews",
  top_stories: "Stories",
  ai_overview: "AI overview",
  knowledge_panel: "Knowledge",
};

function difficultyTone(d: number): { label: string; cls: string } {
  if (d < 30) return { label: "Easy", cls: "bg-success/10 text-success border-success/20" };
  if (d <= 60) return { label: "Medium", cls: "bg-warning/10 text-[#B9791A] border-warning/25" };
  return { label: "Hard", cls: "bg-critical/10 text-critical border-critical/20" };
}

function DifficultyPill({ value }: { value: number }) {
  const t = difficultyTone(value);
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold tnum",
        t.cls,
      )}
      title={`Keyword difficulty ${value}/100 · ${t.label}`}
    >
      {value}
    </span>
  );
}

function SerpChips({ features, max }: { features: SerpFeature[]; max?: number }) {
  if (features.length === 0) return <span className="text-2xs text-muted">—</span>;
  const shown = max ? features.slice(0, max) : features;
  const rest = max ? features.length - shown.length : 0;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((f) => (
        <span
          key={f}
          className="inline-flex items-center rounded border border-border bg-workspace px-1.5 py-0.5 text-[10px] font-medium text-muted"
        >
          {SERP_LABEL[f]}
        </span>
      ))}
      {rest > 0 && <span className="text-[10px] text-muted tnum">+{rest}</span>}
    </div>
  );
}

/** Best (lowest) competitor position across tracked rivals, plus the host. */
function bestCompetitor(k: Keyword): { host: string; position: number } | null {
  let best: { host: string; position: number } | null = null;
  for (const [host, pos] of Object.entries(k.competitorPositions)) {
    if (pos == null) continue;
    if (best == null || pos < best.position) best = { host, position: pos };
  }
  return best;
}

interface GapRow {
  id: string;
  keyword: string;
  volume: number;
  ourPosition: number | null;
  bestHost: string;
  bestPosition: number;
}

/* -------------------------------- page ---------------------------------- */

export default function ResearchPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const [tab, setTab] = useState<SubTab>("explorer");
  const [selected, setSelected] = useState<Keyword | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Explorer filters
  const [intent, setIntent] = useState<SearchIntent | "all">("all");
  const [minVolume, setMinVolume] = useState<number>(0);
  const [maxDifficulty, setMaxDifficulty] = useState<number>(100);
  const [serpOnly, setSerpOnly] = useState<boolean>(false);

  const keywords = SEED.keywords[domain.id];
  const competitors = SEED.competitors[domain.id];
  const lists = SEED.keywordLists[domain.id];

  /* ----------------------------- KPI cards ----------------------------- */
  const kpis = useMemo(() => {
    const total = keywords.length;
    const avgDifficulty = total
      ? Math.round(keywords.reduce((s, k) => s + k.difficulty, 0) / total)
      : 0;
    const totalVolume = keywords.reduce((s, k) => s + k.volume, 0);
    const top10 = keywords.filter((k) => k.position != null && k.position <= 10).length;
    return { total, avgDifficulty, totalVolume, top10 };
  }, [keywords]);

  /* --------------------------- Explorer rows --------------------------- */
  const filtered = useMemo(() => {
    return keywords.filter((k) => {
      if (intent !== "all" && k.intent !== intent) return false;
      if (k.volume < minVolume) return false;
      if (k.difficulty > maxDifficulty) return false;
      if (serpOnly && k.serpFeatures.length === 0) return false;
      return true;
    });
  }, [keywords, intent, minVolume, maxDifficulty, serpOnly]);

  /* ------------------------------ Gap rows ----------------------------- */
  const gapRows = useMemo<GapRow[]>(() => {
    const out: GapRow[] = [];
    for (const k of keywords) {
      const best = bestCompetitor(k);
      if (!best) continue;
      const isOpportunity = k.position == null || k.position > best.position;
      if (!isOpportunity) continue;
      out.push({
        id: k.id,
        keyword: k.keyword,
        volume: k.volume,
        ourPosition: k.position,
        bestHost: best.host,
        bestPosition: best.position,
      });
    }
    return out.sort((a, b) => b.volume - a.volume);
  }, [keywords]);

  function toggleSaved(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* --------------------------- Explorer cols --------------------------- */
  const explorerCols: Column<Keyword>[] = [
    {
      key: "keyword",
      header: "Keyword",
      sortValue: (r) => r.keyword,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{r.keyword}</span>
          {savedIds.has(r.id) && <Check className="h-3.5 w-3.5 text-success" />}
        </div>
      ),
    },
    {
      key: "intent",
      header: "Intent",
      sortValue: (r) => r.intent,
      render: (r) => <StatusBadge label={r.intent} tone={INTENT_TONE[r.intent]} />,
    },
    {
      key: "volume",
      header: "Volume",
      align: "right",
      sortValue: (r) => r.volume,
      render: (r) => fullNumber(r.volume),
    },
    {
      key: "difficulty",
      header: "Difficulty",
      align: "right",
      sortValue: (r) => r.difficulty,
      render: (r) => <DifficultyPill value={r.difficulty} />,
    },
    {
      key: "cpc",
      header: "CPC",
      align: "right",
      sortValue: (r) => r.cpc,
      render: (r) => currency(r.cpc),
    },
    {
      key: "position",
      header: "Position",
      align: "right",
      sortValue: (r) => r.position ?? 999,
      render: (r) => (
        <span className={r.position == null ? "text-muted" : "text-ink"}>{fmtPosition(r.position)}</span>
      ),
    },
    {
      key: "traffic",
      header: "Traffic pot.",
      align: "right",
      sortValue: (r) => r.trafficPotential,
      render: (r) => fullNumber(r.trafficPotential),
    },
    {
      key: "serp",
      header: "SERP features",
      sortValue: (r) => r.serpFeatures.length,
      render: (r) => <SerpChips features={r.serpFeatures} max={3} />,
    },
    {
      key: "trend",
      header: "Trend",
      sortValue: (r) => r.trend[r.trend.length - 1]! - r.trend[0]!,
      render: (r) => <Sparkline data={r.trend} className="h-6 w-16" />,
    },
  ];

  /* -------------------------- Competitor cols -------------------------- */
  const competitorCols: Column<Competitor>[] = [
    {
      key: "host",
      header: "Competitor",
      sortValue: (r) => r.host,
      render: (r) => <span className="font-medium text-ink">{r.host}</span>,
    },
    {
      key: "common",
      header: "Common keywords",
      align: "right",
      sortValue: (r) => r.commonKeywords,
      render: (r) => fullNumber(r.commonKeywords),
    },
    {
      key: "keywords",
      header: "Total keywords",
      align: "right",
      sortValue: (r) => r.keywords,
      render: (r) => fullNumber(r.keywords),
    },
    {
      key: "authority",
      header: "Authority",
      align: "right",
      sortValue: (r) => r.authority,
      render: (r) => r.authority,
    },
    {
      key: "traffic",
      header: "Est. traffic",
      align: "right",
      sortValue: (r) => r.estTraffic,
      render: (r) => compactNumber(r.estTraffic),
    },
    {
      key: "overlap",
      header: "Overlap",
      align: "right",
      sortValue: (r) => r.overlapPct,
      render: (r) => `${r.overlapPct}%`,
    },
    {
      key: "trend",
      header: "Trend",
      sortValue: (r) => r.trend,
      render: (r) => (
        <StatusBadge
          label={r.trend}
          tone={r.trend === "up" ? "success" : r.trend === "down" ? "critical" : "neutral"}
        />
      ),
    },
  ];

  /* ------------------------------ Gap cols ----------------------------- */
  const gapCols: Column<GapRow>[] = [
    {
      key: "keyword",
      header: "Keyword",
      sortValue: (r) => r.keyword,
      render: (r) => <span className="font-medium text-ink">{r.keyword}</span>,
    },
    {
      key: "our",
      header: "Our position",
      align: "right",
      sortValue: (r) => r.ourPosition ?? 999,
      render: (r) => (
        <span className={r.ourPosition == null ? "text-critical" : "text-ink"}>
          {r.ourPosition == null ? "Not ranking" : r.ourPosition}
        </span>
      ),
    },
    {
      key: "best",
      header: "Best competitor",
      sortValue: (r) => r.bestHost,
      render: (r) => <span className="text-xs text-muted">{r.bestHost}</span>,
    },
    {
      key: "bestPos",
      header: "Their position",
      align: "right",
      sortValue: (r) => r.bestPosition,
      render: (r) => <span className="font-medium text-success">{r.bestPosition}</span>,
    },
    {
      key: "volume",
      header: "Volume",
      align: "right",
      sortValue: (r) => r.volume,
      render: (r) => fullNumber(r.volume),
    },
  ];

  const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: "explorer", label: "Keyword explorer", icon: <Search className="h-3.5 w-3.5" /> },
    { key: "competitors", label: "Organic competitors", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "gap", label: "Keyword gap", icon: <GitCompareArrows className="h-3.5 w-3.5" /> },
    { key: "lists", label: "Saved lists", icon: <ListChecks className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Research Centre"
        description="Keyword research workbench — explore demand, benchmark rivals and surface ranking gaps."
      />

      {scope === "portfolio" && (
        <p className="text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the domain
          rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Tracked keywords" value={fullNumber(kpis.total)} hint={`${domain.host}`} />
        <KpiCard label="Avg difficulty" value={String(kpis.avgDifficulty)} hint="Weighted 0–100 KD" />
        <KpiCard label="Total search volume" value={compactNumber(kpis.totalVolume)} hint="Monthly, all tracked terms" />
        <KpiCard label="Keywords in top 10" value={fullNumber(kpis.top10)} hint="Position 1–10" accent />
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-[color:var(--accent)] text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------- Keyword explorer ------------------------ */}
      {tab === "explorer" && (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">Intent</span>
              <select
                value={intent}
                onChange={(e) => setIntent(e.target.value as SearchIntent | "all")}
                className="h-8 rounded-md border border-border bg-card px-2 text-xs text-ink focus:outline-none focus-visible:outline-2"
              >
                <option value="all">All intents</option>
                <option value="informational">Informational</option>
                <option value="navigational">Navigational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">Min volume</span>
              <input
                type="number"
                min={0}
                value={minVolume}
                onChange={(e) => setMinVolume(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-28 rounded-md border border-border bg-card px-2 text-xs text-ink tnum focus:outline-none focus-visible:outline-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">Max difficulty</span>
              <input
                type="number"
                min={0}
                max={100}
                value={maxDifficulty}
                onChange={(e) => setMaxDifficulty(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className="h-8 w-28 rounded-md border border-border bg-card px-2 text-xs text-ink tnum focus:outline-none focus-visible:outline-2"
              />
            </label>
            <button
              onClick={() => setSerpOnly((v) => !v)}
              className={cn(
                "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
                serpOnly
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                  : "border-border bg-card text-muted hover:text-ink",
              )}
            >
              Has SERP feature
            </button>
            {(intent !== "all" || minVolume > 0 || maxDifficulty < 100 || serpOnly) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIntent("all");
                  setMinVolume(0);
                  setMaxDifficulty(100);
                  setSerpOnly(false);
                }}
              >
                Reset
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No keywords match these filters"
              description="Loosen the intent, volume or difficulty constraints to see more of the keyword universe."
              icon={<Search className="h-5 w-5" />}
            />
          ) : (
            <DataTable
              rows={filtered}
              columns={explorerCols}
              searchKeys={(r) => r.keyword}
              searchPlaceholder="Search keywords…"
              onRowClick={setSelected}
              exportName={`${domain.id}-keywords`}
              pageSize={12}
            />
          )}
        </Card>
      )}

      {/* ----------------------- Organic competitors ---------------------- */}
      {tab === "competitors" && (
        <Card className="p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-ink">Organic competitors</h3>
            <p className="mt-0.5 text-2xs text-muted">
              Domains competing for {domain.name}&apos;s keyword footprint, ranked by overlap.
            </p>
          </div>
          {competitors.length === 0 ? (
            <EmptyState title="No competitors identified" icon={<Users className="h-5 w-5" />} />
          ) : (
            <DataTable
              rows={competitors}
              columns={competitorCols}
              searchKeys={(r) => r.host}
              searchPlaceholder="Search competitors…"
              exportName={`${domain.id}-competitors`}
              pageSize={12}
            />
          )}
        </Card>
      )}

      {/* ------------------------- Keyword gap ---------------------------- */}
      {tab === "gap" && (
        <Card className="p-4">
          <div className="mb-3 flex items-start gap-2">
            <Target className="mt-0.5 h-4 w-4 text-[color:var(--accent)]" />
            <div>
              <h3 className="text-sm font-semibold text-ink">Keyword gap — opportunities</h3>
              <p className="mt-0.5 text-2xs text-muted">
                Terms where a tracked competitor outranks {domain.name} (we are absent or ranking worse).
                Closing these is the fastest route to incremental organic traffic.
              </p>
            </div>
          </div>
          {gapRows.length === 0 ? (
            <EmptyState
              title="No ranking gaps found"
              description="No competitor currently outranks this domain across the tracked keyword set."
              icon={<Target className="h-5 w-5" />}
            />
          ) : (
            <DataTable
              rows={gapRows}
              columns={gapCols}
              searchKeys={(r) => r.keyword}
              searchPlaceholder="Search opportunities…"
              exportName={`${domain.id}-keyword-gap`}
              pageSize={12}
            />
          )}
        </Card>
      )}

      {/* --------------------------- Saved lists -------------------------- */}
      {tab === "lists" && (
        <div>
          {lists.length === 0 ? (
            <EmptyState title="No saved keyword lists" icon={<ListChecks className="h-5 w-5" />} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lists.map((l) => (
                <Card key={l.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{l.name}</h3>
                    <ListChecks className="h-4 w-4 shrink-0 text-muted" />
                  </div>
                  <p className="mt-1 text-xs text-muted">{l.description}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                    <div>
                      <div className="text-2xs uppercase tracking-wide text-muted">Keywords</div>
                      <div className="text-sm font-semibold text-ink tnum">{fullNumber(l.keywordCount)}</div>
                    </div>
                    <div>
                      <div className="text-2xs uppercase tracking-wide text-muted">Volume</div>
                      <div className="text-sm font-semibold text-ink tnum">{compactNumber(l.totalVolume)}</div>
                    </div>
                    <div>
                      <div className="text-2xs uppercase tracking-wide text-muted">Avg KD</div>
                      <div className="text-sm font-semibold text-ink tnum">{l.avgDifficulty}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-2xs text-muted">Updated {formatDate(l.updatedAt)}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------- Keyword drawer ----------------------- */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.keyword ?? ""}
        subtitle={selected ? `${selected.location} · ${selected.intent}` : undefined}
        footer={
          selected && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-2xs text-muted">
                {savedIds.has(selected.id) ? "Added to working list (demo)" : "Not in any list"}
              </span>
              <Button
                variant={savedIds.has(selected.id) ? "secondary" : "primary"}
                size="sm"
                onClick={() => toggleSaved(selected.id)}
              >
                {savedIds.has(selected.id) ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Added
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> Add to list
                  </>
                )}
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <div>
            <div className="grid grid-cols-2 gap-x-4">
              <DrawerField label="Intent">
                <StatusBadge label={selected.intent} tone={INTENT_TONE[selected.intent]} />
              </DrawerField>
              <DrawerField label="Difficulty">
                <DifficultyPill value={selected.difficulty} />
              </DrawerField>
              <DrawerField label="Search volume">{fullNumber(selected.volume)}/mo</DrawerField>
              <DrawerField label="CPC">{currency(selected.cpc)}</DrawerField>
              <DrawerField label="Our position">
                {selected.position == null ? (
                  <span className="text-muted">Not ranking</span>
                ) : (
                  <span>
                    {selected.position}
                    {selected.prevPosition != null && (
                      <span className="ml-1 text-2xs text-muted tnum">(was {selected.prevPosition})</span>
                    )}
                  </span>
                )}
              </DrawerField>
              <DrawerField label="Traffic potential">{fullNumber(selected.trafficPotential)}/mo</DrawerField>
            </div>

            <DrawerField label="12-month volume trend">
              <Sparkline data={selected.trend} className="h-10 w-full" />
            </DrawerField>

            <DrawerField label="SERP features">
              <SerpChips features={selected.serpFeatures} />
            </DrawerField>

            <DrawerField label="Target URL">
              {selected.targetUrl ? (
                <span className="break-all text-xs text-[color:var(--accent)]">{selected.targetUrl}</span>
              ) : (
                <span className="text-muted">No page targeting this term yet</span>
              )}
            </DrawerField>

            <DrawerField label="Competitor positions">
              {Object.keys(selected.competitorPositions).length === 0 ? (
                <span className="text-muted">No competitor data</span>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {Object.entries(selected.competitorPositions).map(([host, pos]) => (
                    <div key={host} className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-ink">{host}</span>
                      <span className={cn("text-xs font-medium tnum", pos == null ? "text-muted" : "text-ink")}>
                        {pos == null ? "—" : `#${pos}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DrawerField>
          </div>
        )}
      </Drawer>
    </div>
  );
}
