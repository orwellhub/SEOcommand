"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bot, Building2, Globe2, Link2, Search, Sparkles, Users, ListOrdered, Target, GitCompareArrows } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  StatusBadge,
  SourceBadge,
  EmptyState,
  Skeleton,
  Button,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ScopeNote } from "@/components/ui/scope-note";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { Sparkline } from "@/components/charts/sparkline";
import {
  compactNumber,
  fullNumber,
  percent,
  currency,
  position as fmtPosition,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import { useScopedLive } from "@/lib/use-live";
import type { KeywordGapRow } from "@/platform/types";
import type {
  Keyword,
  Competitor,
  GscRow,
  StrikingDistanceRow,
  SearchIntent,
  SerpFeature,
} from "@/lib/types";

/* ------------------------------- helpers -------------------------------- */

type SubTab = "ranked" | "queries" | "competitors" | "gaps" | "striking";

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

/** Colour-banded keyword-difficulty pill: <30 success, 30–60 warning, >60 critical. */
function DifficultyPill({ value }: { value: number }) {
  const cls =
    value < 30
      ? "bg-success/10 text-success border-success/20"
      : value <= 60
        ? "bg-warning/10 text-[#B9791A] border-warning/25"
        : "bg-critical/10 text-critical border-critical/20";
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded-full border px-2 py-0.5 text-2xs font-semibold tnum",
        cls,
      )}
      title={`Keyword difficulty ${value}/100`}
    >
      {value}
    </span>
  );
}

function SerpChips({ features }: { features: SerpFeature[] }) {
  if (features.length === 0) return <span className="text-2xs text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {features.map((f) => (
        <span
          key={f}
          className="inline-flex items-center rounded border border-border bg-workspace px-1.5 py-0.5 text-[10px] font-medium text-muted"
        >
          {SERP_LABEL[f]}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------- page ---------------------------------- */

export default function ResearchPage() {
  const searchParams = useSearchParams();
  return searchParams.get("site") ? <SearchPerformancePage /> : <GlobalResearchHome />;
}

const RESEARCH_AREAS = [
  { title: "Keyword research", description: "Discover worldwide demand, questions, intent and commercial signals.", href: "/keyword-research", icon: Search, color: "#335CFF", available: true },
  { title: "Domain research", description: "Explore any domain, preserve the evidence and map qualified opportunities to a website.", href: "/domain-research", icon: Globe2, color: "#12B8C4", available: true },
  { title: "Topic opportunities", description: "Turn clusters, gaps and existing-page evidence into ranked opportunities.", icon: Sparkles, color: "#7137F5", available: false },
  { title: "Competitive research", description: "Compare domains, keyword coverage, content gaps and market movement.", icon: Users, color: "#FF6B5E", available: false },
  { title: "Backlink research", description: "Investigate referring domains, link intersections and earned mentions.", icon: Link2, color: "#F2B544", available: false },
  { title: "AI research", description: "Discover prompts, citation sources and competitor visibility across answer engines.", icon: Bot, color: "#16A879", available: false },
] as const;

function GlobalResearchHome() {
  return (
    <div className="animate-in space-y-5">
      <PageHeader title="Research" description="Explore markets, domains and topics independently. Nothing is connected to a website until you explicitly map it." />
      <Card className="overflow-hidden border-0 bg-ink text-white">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:p-8"><div><div className="text-2xs font-bold uppercase tracking-[0.16em] text-white/45">Global workspace</div><h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight">Research first. Decide where it belongs later.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Save reusable evidence, qualify an opportunity and then map it to one or more websites through an explicit, auditable hand-off.</p><Link href="/keyword-research" className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[#6B5BFF] px-4 text-sm font-bold text-white hover:bg-[#7B6DFF]">Start keyword research <ArrowRight className="h-4 w-4" /></Link></div><div className="rounded-lg border border-white/10 bg-white/[0.06] p-4"><div className="text-2xs font-bold uppercase tracking-wide text-white/45">Workflow</div><div className="mt-3 space-y-2">{["Research and save evidence", "Qualify and value the opportunity", "Map it to a website or page", "Approve, execute and verify"].map((label, index) => <div key={label} className="flex items-center gap-3 rounded-md bg-white/[0.05] px-3 py-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-black text-[#7FE4EA]">{index + 1}</span><span className="text-xs font-semibold text-white/80">{label}</span></div>)}</div></div></div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {RESEARCH_AREAS.map(({ title, description, icon: Icon, color, available, ...item }) => {
          const content = <><span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} /><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ color, background: `${color}14` }}><Icon className="h-5 w-5" /></span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${available ? "border-success/20 bg-success/10 text-success" : "border-border bg-workspace text-muted"}`}>{available ? "Available" : "Next stage"}</span></div><h2 className="mt-4 text-base font-extrabold text-ink">{title}</h2><p className="mt-1 min-h-10 text-xs leading-5 text-muted">{description}</p>{available && <div className="mt-4 flex items-center gap-1 text-xs font-bold text-purple">Open research <ArrowRight className="h-3.5 w-3.5" /></div>}</>;
          return available && "href" in item ? <Link key={title} href={item.href} className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">{content}</Link> : <div key={title} className="relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-card">{content}</div>;
        })}
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-purple" /><div><div className="text-sm font-bold text-ink">Website context remains explicit</div><p className="mt-1 text-xs leading-5 text-muted">Opening Research does not inherit the last website you viewed. A website is attached only through a visible Map to website action.</p></div></div>
    </div>
  );
}

function SearchPerformancePage() {
  const { data: bundle, loading, error, isPortfolio, scopeLabel, scopeHost, scopeId } = useScopedLive();

  const [tab, setTab] = useState<SubTab>("ranked");
  const [selected, setSelected] = useState<Keyword | null>(null);

  // Ranked-keyword filters
  const [intent, setIntent] = useState<SearchIntent | "all">("all");
  const [minVolume, setMinVolume] = useState<number>(0);
  const [maxDifficulty, setMaxDifficulty] = useState<number>(100);

  const datasets = bundle?.datasets;
  const keywordsDs = datasets?.keywords;
  const queriesDs = datasets?.gsc_queries;
  const competitorsDs = datasets?.competitors;
  const gapsDs = datasets?.keyword_gaps;
  const strikingDs = datasets?.striking_distance;

  const keywords = keywordsDs?.data;

  /* ----------------------------- KPI cards ----------------------------- */
  const kpis = useMemo(() => {
    if (!keywords) return null;
    const total = keywords.length;
    const totalVolume = keywords.reduce((s, k) => s + k.volume, 0);
    const avgDifficulty = total
      ? Math.round(keywords.reduce((s, k) => s + k.difficulty, 0) / total)
      : 0;
    const top10 = keywords.filter((k) => k.position != null && k.position <= 10).length;
    return { total, totalVolume, avgDifficulty, top10 };
  }, [keywords]);

  /* --------------------------- Filtered rows --------------------------- */
  const filteredKeywords = useMemo(() => {
    if (!keywords) return [];
    return keywords.filter((k) => {
      if (intent !== "all" && k.intent !== intent) return false;
      if (k.volume < minVolume) return false;
      if (k.difficulty > maxDifficulty) return false;
      return true;
    });
  }, [keywords, intent, minVolume, maxDifficulty]);

  const filtersActive = intent !== "all" || minVolume > 0 || maxDifficulty < 100;

  /* ------------------------------ Columns ------------------------------ */
  const keywordCols = useMemo<Column<Keyword>[]>(
    () => [
      {
        key: "keyword",
        header: "Keyword",
        sortValue: (r) => r.keyword,
        render: (r) => <span className="font-medium text-ink">{r.keyword}</span>,
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
          <span className={r.position == null ? "text-muted" : "text-ink"}>
            {fmtPosition(r.position)}
          </span>
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
        key: "trend",
        header: "Trend",
        sortValue: (r) =>
          r.trend.length > 1 ? r.trend[r.trend.length - 1]! - r.trend[0]! : 0,
        render: (r) =>
          r.trend.length > 1 ? (
            <Sparkline data={r.trend} className="h-6 w-16" />
          ) : (
            <span className="text-2xs text-muted">—</span>
          ),
      },
    ],
    [],
  );

  const queryCols = useMemo<Column<GscRow>[]>(
    () => [
      {
        key: "query",
        header: "Query",
        sortValue: (r) => r.key,
        render: (r) => <span className="font-medium text-ink">{r.key}</span>,
      },
      {
        key: "clicks",
        header: "Clicks",
        align: "right",
        sortValue: (r) => r.clicks,
        render: (r) => fullNumber(r.clicks),
      },
      {
        key: "impressions",
        header: "Impressions",
        align: "right",
        sortValue: (r) => r.impressions,
        render: (r) => fullNumber(r.impressions),
      },
      {
        key: "ctr",
        header: "CTR",
        align: "right",
        sortValue: (r) => r.ctr,
        render: (r) => percent(r.ctr),
      },
      {
        key: "position",
        header: "Avg position",
        align: "right",
        sortValue: (r) => r.position,
        render: (r) => r.position.toFixed(1),
      },
    ],
    [],
  );

  const competitorCols = useMemo<Column<Competitor>[]>(
    () => [
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
        render: (r) => String(r.authority),
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
        render: (r) => percent(r.overlapPct, 0),
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
    ],
    [],
  );

  const gapCols = useMemo<Column<KeywordGapRow>[]>(() => [
    { key: "keyword", header: "Keyword gap", sortValue: (row) => row.keyword, render: (row) => <span className="font-medium text-ink">{row.keyword}</span> },
    { key: "competitor", header: "Competitor", sortValue: (row) => row.competitorHost, render: (row) => <span className="text-muted">{row.competitorHost}</span> },
    { key: "competitorPosition", header: "Rival pos.", align: "right", sortValue: (row) => row.competitorPosition ?? 101, render: (row) => row.competitorPosition ?? "—" },
    { key: "sitePosition", header: "Your pos.", align: "right", sortValue: (row) => row.sitePosition ?? 101, render: (row) => row.sitePosition ?? "Not ranking" },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume ?? 0, render: (row) => row.volume == null ? "—" : fullNumber(row.volume) },
    { key: "difficulty", header: "Difficulty", align: "right", sortValue: (row) => row.difficulty ?? 0, render: (row) => row.difficulty == null ? "—" : <DifficultyPill value={row.difficulty} /> },
    { key: "intent", header: "Intent", sortValue: (row) => row.intent ?? "", render: (row) => row.intent ? <StatusBadge label={row.intent} tone="neutral" /> : "—" },
  ], []);

  const strikingCols = useMemo<Column<StrikingDistanceRow>[]>(
    () => [
      {
        key: "query",
        header: "Query",
        sortValue: (r) => r.query,
        render: (r) => <span className="font-medium text-ink">{r.query}</span>,
      },
      {
        key: "position",
        header: "Position",
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

  const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: "ranked", label: "Ranked keywords", icon: <Search className="h-3.5 w-3.5" /> },
    { key: "queries", label: "Search queries (GSC)", icon: <ListOrdered className="h-3.5 w-3.5" /> },
    { key: "competitors", label: "Organic competitors", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "gaps", label: "Keyword gaps", icon: <GitCompareArrows className="h-3.5 w-3.5" /> },
    { key: "striking", label: "Striking distance", icon: <Target className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Research Centre"
        description={`Live keyword universe for ${scopeHost} — ranked terms, first-party search queries, organic rivals and page-one opportunities.`}
        lastSync={bundle?.lastSync ?? null}
        loading={loading}
      />

      <ScopeNote isPortfolio={isPortfolio} noun="research data" />

      {loading && !bundle ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-96" />
        </>
      ) : error ? (
        <EmptyState title="Could not load live data" description={error} />
      ) : (
        <>
          {/* KPI row — real values only; "—" until the keyword dataset syncs. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Tracked keywords"
              value={kpis ? fullNumber(kpis.total) : "—"}
              hint={scopeHost}
            />
            <KpiCard
              label="Total search volume"
              value={kpis ? compactNumber(kpis.totalVolume) : "—"}
              hint="Monthly, all tracked terms"
            />
            <KpiCard
              label="Avg difficulty"
              value={kpis ? String(kpis.avgDifficulty) : "—"}
              hint="Mean 0–100 KD"
            />
            <KpiCard
              label="Keywords in top 10"
              value={kpis ? fullNumber(kpis.top10) : "—"}
              hint="Position 1–10"
              accent
            />
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

          {/* -------------------------- Ranked keywords ----------------------- */}
          {tab === "ranked" &&
            (!keywordsDs ? (
              <EmptyState
                title="No keyword data for this domain yet"
                description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
                icon={<Search className="h-5 w-5" />}
              />
            ) : (
              <Card className="p-4">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-2xs font-medium uppercase tracking-wide text-muted">
                        Min volume
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={minVolume}
                        onChange={(e) => setMinVolume(Math.max(0, Number(e.target.value) || 0))}
                        className="h-8 w-28 rounded-md border border-border bg-card px-2 text-xs text-ink tnum focus:outline-none focus-visible:outline-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-2xs font-medium uppercase tracking-wide text-muted">
                        Max difficulty
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={maxDifficulty}
                        onChange={(e) =>
                          setMaxDifficulty(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                        }
                        className="h-8 w-28 rounded-md border border-border bg-card px-2 text-xs text-ink tnum focus:outline-none focus-visible:outline-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-2xs font-medium uppercase tracking-wide text-muted">
                        Intent
                      </span>
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
                    {filtersActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIntent("all");
                          setMinVolume(0);
                          setMaxDifficulty(100);
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                  <SourceBadge
                    source={keywordsDs.provenance.source}
                    mode={keywordsDs.provenance.mode}
                    freshness={keywordsDs.provenance.freshness}
                  />
                </div>

                <DataTable
                  rows={filteredKeywords}
                  columns={keywordCols}
                  searchKeys={(r) => r.keyword}
                  searchPlaceholder="Search keywords…"
                  onRowClick={setSelected}
                  exportName={`${scopeId}-keywords`}
                  pageSize={12}
                  emptyLabel="No keywords match the current filters."
                />
              </Card>
            ))}

          {/* ------------------------ Search queries (GSC) --------------------- */}
          {tab === "queries" &&
            (!queriesDs ? (
              <EmptyState
                title="Search queries not yet synced"
                description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
                icon={<ListOrdered className="h-5 w-5" />}
              />
            ) : (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Search queries</h3>
                    <p className="mt-0.5 text-2xs text-muted">
                      Real first-party queries from Google Search Console — last 28 days.
                    </p>
                  </div>
                  <SourceBadge
                    source={queriesDs.provenance.source}
                    mode={queriesDs.provenance.mode}
                    freshness={queriesDs.provenance.freshness}
                  />
                </div>
                <DataTable
                  rows={queriesDs.data}
                  columns={queryCols}
                  searchKeys={(r) => r.key}
                  searchPlaceholder="Search queries…"
                  exportName={`${scopeId}-gsc-queries`}
                  pageSize={12}
                />
              </Card>
            ))}

          {/* ----------------------- Organic competitors ---------------------- */}
          {tab === "competitors" &&
            (!competitorsDs ? (
              <EmptyState
                title="Competitors not yet synced"
                description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
                icon={<Users className="h-5 w-5" />}
              />
            ) : (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Organic competitors</h3>
                    <p className="mt-0.5 text-2xs text-muted">
                      Domains competing for {scopeLabel}&apos;s keyword footprint.
                    </p>
                  </div>
                  <SourceBadge
                    source={competitorsDs.provenance.source}
                    mode={competitorsDs.provenance.mode}
                    freshness={competitorsDs.provenance.freshness}
                  />
                </div>
                <DataTable
                  rows={competitorsDs.data}
                  columns={competitorCols}
                  searchKeys={(r) => r.host}
                  searchPlaceholder="Search competitors…"
                  exportName={`${scopeId}-competitors`}
                  pageSize={12}
                />
              </Card>
            ))}

          {tab === "gaps" &&
            (!gapsDs ? (
              <EmptyState title="Keyword gaps not yet synced" description="The gap scan starts after competitor discovery in the first approved scan." icon={<GitCompareArrows className="h-5 w-5" />} />
            ) : (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="text-sm font-semibold text-ink">Competitor keyword gaps</h3><p className="mt-0.5 text-2xs text-muted">High-demand terms where a principal competitor ranks and {scopeLabel} does not.</p></div>
                  <SourceBadge source={gapsDs.provenance.source} mode={gapsDs.provenance.mode} freshness={gapsDs.provenance.freshness} />
                </div>
                <DataTable rows={gapsDs.data} columns={gapCols} searchKeys={(row) => `${row.keyword} ${row.competitorHost} ${row.intent ?? ""}`} searchPlaceholder="Search keyword gaps…" exportName={`${scopeId}-keyword-gaps`} pageSize={20} />
              </Card>
            ))}

          {/* ------------------------ Striking distance ------------------------ */}
          {tab === "striking" &&
            (!strikingDs ? (
              <EmptyState
                title="Striking distance not yet synced"
                description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
                icon={<Target className="h-5 w-5" />}
              />
            ) : (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Striking distance</h3>
                    <p className="mt-0.5 text-2xs text-muted">
                      Measured page-one opportunities — real queries ranking positions 4–20 with
                      impressions, from Search Console.
                    </p>
                  </div>
                  <SourceBadge
                    source={strikingDs.provenance.source}
                    mode={strikingDs.provenance.mode}
                    freshness={strikingDs.provenance.freshness}
                  />
                </div>
                <DataTable
                  rows={strikingDs.data}
                  columns={strikingCols}
                  searchKeys={(r) => r.query}
                  searchPlaceholder="Search queries…"
                  exportName={`${scopeId}-striking-distance`}
                  pageSize={12}
                />
              </Card>
            ))}
        </>
      )}

      {/* --------------------------- Keyword drawer ------------------------- */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.keyword ?? ""}
        subtitle={selected ? `${selected.location} · ${selected.intent}` : undefined}
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
                  <span className="tnum">
                    {selected.position}
                    {selected.prevPosition != null && (
                      <span className="ml-1 text-2xs text-muted tnum">
                        (was {selected.prevPosition})
                      </span>
                    )}
                  </span>
                )}
              </DrawerField>
              <DrawerField label="Traffic potential">
                {fullNumber(selected.trafficPotential)}/mo
              </DrawerField>
              <DrawerField label="Competition">
                {percent(selected.competition * 100, 0)}
              </DrawerField>
              <DrawerField label="Location">{selected.location}</DrawerField>
            </div>

            {selected.trend.length > 1 && (
              <DrawerField label="12-month volume trend">
                <Sparkline data={selected.trend} className="h-10 w-full" />
              </DrawerField>
            )}

            <DrawerField label="SERP features">
              <SerpChips features={selected.serpFeatures} />
            </DrawerField>

            {selected.targetUrl != null && (
              <DrawerField label="Target URL">
                <span className="break-all text-xs text-[color:var(--accent)]">
                  {selected.targetUrl}
                </span>
              </DrawerField>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
