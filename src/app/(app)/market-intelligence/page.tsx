"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  CircleDollarSign,
  FileStack,
  Grid3X3,
  LayoutDashboard,
  Link2,
  Plus,
  Save,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Users,
} from "lucide-react";
import {
  useDomain,
  useResolvedDomain,
} from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
} from "@/components/ui/primitives";
import {
  SiteFindingWorkDrawer,
  type SiteFinding,
} from "@/components/workflow/site-finding-work-drawer";
type Tab =
  | "opportunities"
  | "sov"
  | "content"
  | "links"
  | "coverage"
  | "ai"
  | "builder"
  | "forecast";
type Data = Record<string, any>;
const tabs: Array<{ id: Tab; label: string; icon: any }> = [
  { id: "opportunities", label: "Opportunity queue", icon: TrendingUp },
  { id: "sov", label: "Share of voice", icon: Users },
  { id: "content", label: "Content explorer", icon: FileStack },
  { id: "links", label: "Link research", icon: Link2 },
  { id: "coverage", label: "Coverage matrix", icon: Grid3X3 },
  { id: "ai", label: "AI research", icon: Brain },
  { id: "builder", label: "Dashboard builder", icon: LayoutDashboard },
  { id: "forecast", label: "Forecasting", icon: TrendingUp },
];
const widgetOptions = [
  "share_of_voice",
  "newcomers",
  "publishing_velocity",
  "link_opportunities",
  "coverage_gaps",
  "ai_share_of_voice",
  "verified_value",
  "forecast",
] as const;
export default function MarketIntelligencePage() {
  const { range } = useDomain();
  const domain = useResolvedDomain();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("opportunities");
  const [device, setDevice] = useState("all");
  const [market, setMarket] = useState("all");
  const [segment, setSegment] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [work, setWork] = useState<SiteFinding | null>(null);
  const [dashboardName, setDashboardName] = useState(
    "Market intelligence view",
  );
  const [widgets, setWidgets] = useState<string[]>([
    "share_of_voice",
    "newcomers",
    "coverage_gaps",
  ]);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/market-intelligence?site=${encodeURIComponent(domain.id)}&days=${range.slice(0, -1)}&device=${encodeURIComponent(device)}&market=${encodeURIComponent(market)}&segment=${encodeURIComponent(segment)}`,
        { cache: "no-store" },
      );
      const b = await r.json();
      if (!r.ok)
        throw new Error(b.error ?? "Market intelligence could not be loaded.");
      setData(b);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Market intelligence could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [device, domain.id, market, range, segment]);
  useEffect(() => {
    void load();
  }, [load]);
  const finding = (input: {
    key: string;
    title: string;
    module: string;
    type: SiteFinding["executionType"];
    score: number;
    url?: string | null;
    keywords?: string[];
    evidence: string;
    raw: Record<string, unknown>;
  }): SiteFinding => ({
    key: `market:${input.key}`,
    title: input.title,
    module: input.module,
    executionType: input.type,
    priorityScore: input.score,
    pageMode: input.url ? "existing_page" : "site_wide",
    targetUrl: input.url,
    targetKeywords: input.keywords ?? [],
    evidenceLabel: input.evidence,
    sourceUrl: `/market-intelligence?site=${encodeURIComponent(domain.id)}&view=${tab}`,
    sourceEvidence: { kind: "market_intelligence", lens: tab, ...input.raw },
  });
  async function saveDashboard() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/custom-dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteSlug: domain.id,
          name: dashboardName,
          widgets: widgets.map((metric, index) => ({
            id: `widget-${Date.now()}-${index}`,
            kind:
              metric === "verified_value"
                ? "outcomes"
                : metric === "newcomers" || metric === "coverage_gaps"
                  ? "table"
                  : "metric",
            title: metric.replace(/_/g, " "),
            metric,
            size: index === 0 ? "large" : "medium",
          })),
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Dashboard could not be saved.");
      setData((d: any) =>
        d ? { ...d, dashboards: [b.dashboard, ...(d.dashboards ?? [])] } : d,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Dashboard could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteDashboard(id: string) {
    setError(null);
    const response = await fetch("/api/custom-dashboards", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, siteSlug: domain.id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      return setError(body.error ?? "Dashboard could not be removed.");
    setData((current: any) =>
      current
        ? {
            ...current,
            dashboards: current.dashboards.filter(
              (item: any) => item.id !== id,
            ),
          }
        : current,
    );
  }
  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Market intelligence"
        description={`A prioritised market map for ${domain.name}—every finding keeps its stored evidence and execution path.`}
      />
      {error && (
        <div
          role="alert"
          className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical"
        >
          {error}
        </div>
      )}
      {loading ? (
        <>
          <Skeleton className="h-16" />
          <Skeleton className="h-[520px]" />
        </>
      ) : !data ? (
        <EmptyState
          title="No market intelligence yet"
          description="Run approved research and tracking to populate these lenses."
        />
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1.5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold ${tab === id ? "bg-ink text-card" : "text-muted hover:bg-workspace hover:text-ink"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-md border border-border bg-workspace/40 px-3 py-2 text-[10px] text-muted">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-success" />
            {data.provenance.source} ·{" "}
            {data.provenance.paidRefresh ? "Paid refresh" : "No paid refresh"} ·{" "}
            {data.provenance.observedAt
              ? `Latest stored observation ${new Date(data.provenance.observedAt).toLocaleString()}`
              : "No stored observation in this range"}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Market slice
            </span>
            <FilterSelect
              label="Device"
              value={device}
              setValue={setDevice}
              options={data.filters.options.devices}
            />
            <FilterSelect
              label="Market"
              value={market}
              setValue={setMarket}
              options={data.filters.options.markets}
              prefix="Market "
            />
            <FilterSelect
              label="Segment"
              value={segment}
              setValue={setSegment}
              options={data.filters.options.segments}
            />
            <Link
              href={`/scan-centre?site=${encodeURIComponent(domain.id)}`}
              className="ml-auto text-xs font-bold text-purple hover:underline"
            >
              Manage collection and cost
            </Link>
          </div>
          <DataHealth datasets={data.datasets} />
          {tab === "opportunities" && (
            <Opportunities
              rows={data.opportunities}
              onWork={(row: any) =>
                setWork(
                  finding({
                    key: row.id,
                    title: row.title,
                    module:
                      row.lens === "links"
                        ? "Backlinks"
                        : row.lens === "ai"
                          ? "AI visibility"
                          : "Content",
                    type: [
                      "content_brief",
                      "refresh_brief",
                      "link_prospect_list",
                      "technical_task",
                    ].includes(row.executionType)
                      ? row.executionType
                      : "content_brief",
                    score: row.score,
                    keywords:
                      row.evidence?.keyword || row.evidence?.prompt
                        ? [row.evidence.keyword ?? row.evidence.prompt]
                        : [],
                    url: row.evidence?.targetUrl ?? null,
                    evidence: row.detail,
                    raw: row,
                  }),
                )
              }
            />
          )}
          {tab === "sov" && <Sov data={data.shareOfVoice} />}{" "}
          {tab === "content" && (
            <Content
              data={data.content}
              onWork={(row: any) =>
                setWork(
                  finding({
                    key: `content:${row.host}:${row.url}`,
                    title: `Create stronger coverage than ${row.host}`,
                    module: "Content",
                    type: "content_brief",
                    score: 82,
                    url: null,
                    keywords: row.keyword ? [row.keyword] : [],
                    evidence: `Competitor page ${row.url ?? row.keyword}`,
                    raw: row,
                  }),
                )
              }
            />
          )}{" "}
          {tab === "links" && (
            <Links
              data={data.links}
              onWork={(row: any) =>
                setWork(
                  finding({
                    key: `link:${row.id}`,
                    title: `Pursue authority opportunity from ${row.sourceDomain}`,
                    module: "Backlinks",
                    type: "link_prospect_list",
                    score: row.relevance ?? 75,
                    evidence: `Authority ${row.authority ?? "unknown"} · ${row.reason ?? row.status}`,
                    raw: row,
                  }),
                )
              }
            />
          )}{" "}
          {tab === "coverage" && (
            <Coverage
              data={data.coverage}
              onWork={(row: any) =>
                setWork(
                  finding({
                    key: `coverage:${row.service}:${row.market}`,
                    title: `${row.state === "missing" ? "Create" : "Improve"} ${row.service} coverage in market ${row.market}`,
                    module: "Content",
                    type: row.targetUrl ? "refresh_brief" : "content_brief",
                    score: row.state === "missing" ? 85 : 70,
                    url: row.targetUrl,
                    keywords: [`${row.service} ${row.market}`],
                    evidence: `${row.state} coverage · demand ${row.demand}`,
                    raw: row,
                  }),
                )
              }
            />
          )}{" "}
          {tab === "ai" && (
            <Ai
              data={data.ai}
              onWork={(row: any) =>
                setWork(
                  finding({
                    key: `ai:${row.id ?? row.domain}`,
                    title: row.prompt
                      ? `Build an answer for “${row.prompt}”`
                      : `Earn citations from ${row.domain}`,
                    module: "AI visibility",
                    type: row.prompt ? "content_brief" : "link_prospect_list",
                    score: row.priorityScore ?? 78,
                    keywords: row.prompt ? [row.prompt] : [],
                    evidence: row.prompt
                      ? `${row.topic} prompt opportunity`
                      : `${row.citations} measured AI citations`,
                    raw: row,
                  }),
                )
              }
            />
          )}{" "}
          {tab === "builder" && (
            <Builder
              data={data}
              name={dashboardName}
              setName={setDashboardName}
              widgets={widgets}
              setWidgets={setWidgets}
              save={() => void saveDashboard()}
              remove={(id) => void deleteDashboard(id)}
              saving={saving}
            />
          )}{" "}
          {tab === "forecast" && <Forecast rows={data.forecasts} />}
        </>
      )}
      <SiteFindingWorkDrawer
        finding={work}
        siteSlug={domain.id}
        siteName={domain.name}
        onClose={() => setWork(null)}
      />
    </div>
  );
}
function FilterSelect({
  label,
  value,
  setValue,
  options,
  prefix = "",
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: string[];
  prefix?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 rounded-md border border-border bg-workspace px-2 text-xs font-semibold text-ink"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {prefix}
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
function DataHealth({
  datasets,
}: {
  datasets: Record<
    string,
    {
      observedAt: string | null;
      records: number;
      state: string;
      confidence: string;
    }
  >;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {Object.entries(datasets).map(([name, item]) => (
        <div
          key={name}
          className="rounded-md border border-border bg-card px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold capitalize text-ink">
              {name}
            </span>
            <StatusBadge
              label={item.state}
              tone={
                item.state === "ready"
                  ? "success"
                  : item.state === "partial"
                    ? "warning"
                    : "neutral"
              }
            />
          </div>
          <div className="mt-1 text-[9px] text-muted">
            {item.records} records · {item.confidence} confidence
          </div>
        </div>
      ))}
    </div>
  );
}
function Opportunities({
  rows,
  onWork,
}: {
  rows: any[];
  onWork: (row: any) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        title="No defensible opportunities in this slice"
        description="Collect ranking, competitor, link-gap or AI observations, or broaden the market filters above."
        icon={<TrendingUp className="h-6 w-6" />}
      />
    );
  return (
    <Card>
      <Head
        title="Prioritised opportunity queue"
        sub="Ranked by evidence, demand and competitive position; execution still requires an explicit handoff"
      />
      <div className="divide-y divide-border">
        {rows.slice(0, 50).map((row) => (
          <div
            key={row.id}
            className="grid gap-3 p-4 md:grid-cols-[56px_minmax(0,1fr)_120px_auto] md:items-center"
          >
            <div className="rounded-md bg-ink px-2 py-2 text-center text-sm font-black text-card tnum">
              {row.score}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm text-ink">{row.title}</b>
                <StatusBadge label={row.lens} tone="info" />
              </div>
              <p className="mt-1 text-xs text-muted">{row.detail}</p>
            </div>
            <div className="text-[10px] text-muted">
              <b className="block capitalize text-ink">
                {row.confidence} confidence
              </b>
              {String(row.kind).replace(/_/g, " ")}
            </div>
            <Button onClick={() => onWork(row)}>
              <Plus className="h-3.5 w-3.5" />
              Create work
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
function Sov({ data }: { data: any }) {
  if (!data.leaders.length)
    return (
      <EmptyState
        title="Share of Voice needs ranking history"
        description="Track keywords for at least two dates to compare your visibility with observed competitors."
        icon={<Users className="h-6 w-6" />}
      />
    );
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card>
        <Head
          title="Competitive Share of Voice"
          sub={`Latest stored snapshot · ${data.latestDate}`}
        />
        <div className="divide-y divide-border">
          {data.leaders.map((r: any, i: number) => (
            <div
              key={r.host}
              className="grid grid-cols-[28px_1fr_120px_90px] items-center gap-2 p-3"
            >
              <b className="text-xs text-muted">{i + 1}</b>
              <div className="text-xs font-bold text-ink">
                {r.host === "owned" ? "Your website" : r.host}
                {r.newcomer && <StatusBadge label="Newcomer" tone="warning" />}
              </div>
              <div>
                <div className="h-2 rounded-full bg-workspace">
                  <div
                    className="h-full rounded-full bg-purple"
                    style={{ width: `${r.share}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-muted">
                  {r.share}% share
                </div>
              </div>
              <span
                className={`text-right text-xs font-bold ${r.change > 0 ? "text-success" : r.change < 0 ? "text-critical" : "text-muted"}`}
              >
                {r.change > 0 ? "+" : ""}
                {r.change}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Head title="Market segments" sub="Intent, device and saved tags" />
        <div className="divide-y divide-border">
          {data.segments.map((r: any) => (
            <div key={r.segment} className="flex justify-between p-3 text-xs">
              <span className="font-semibold text-ink">{r.segment}</span>
              <span className="text-muted">
                {r.ownedShare}% · {r.keywords} keywords
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
function Content({ data, onWork }: { data: any[]; onWork: (r: any) => void }) {
  return (
    <div className="space-y-4">
      {data.length ? (
        data.map((c: any) => (
          <Card key={c.host}>
            <Head
              title={c.host}
              sub={`${c.organicTraffic ?? "—"} organic traffic · ${c.publishingVelocity ?? "—"} new pages/month`}
            />
            <div className="grid divide-y divide-border lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              <List title="Top content" rows={c.topPages} action={onWork} />
              <List
                title="Recently published"
                rows={c.newPages}
                action={onWork}
              />
              <List
                title="Declining opportunities"
                rows={c.decliningPages}
                action={onWork}
              />
              <List title="Content gaps" rows={c.contentGaps} action={onWork} />
            </div>
          </Card>
        ))
      ) : (
        <EmptyState
          title="No competitor content snapshots"
          description="Use Competitor Explorer twice over time to calculate publishing velocity and page changes."
        />
      )}
    </div>
  );
}
function Links({ data, onWork }: { data: any; onWork: (r: any) => void }) {
  const sections = [
    ["Link Intersect", data.intersect],
    ["Unlinked mentions", data.unlinkedMentions],
    ["Broken-link opportunities", data.brokenOpportunities],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Mini label="Discovered" value={data.crm.discovered} />
        <Mini label="Drafted" value={data.crm.drafted} />
        <Mini label="Contacted" value={data.crm.contacted} />
      </div>
      {sections.map(([label, rows]: any) => (
        <Card key={label}>
          <Head
            title={label}
            sub="Stored evidence; outreach remains approval-gated"
          />
          <List title="" rows={rows} action={onWork} />
        </Card>
      ))}
    </div>
  );
}
function Coverage({ data, onWork }: { data: any; onWork: (r: any) => void }) {
  if (!data.markets.length || !data.services.length)
    return (
      <EmptyState
        title="Coverage matrix needs tracked markets"
        description="Add tracked keywords with a market and service tag, then collect the first ranking observation."
        icon={<Grid3X3 className="h-6 w-6" />}
      />
    );
  return (
    <Card>
      <Head
        title="Service × market coverage"
        sub="Strong, weak and missing coverage with demand overlay"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-xs">
          <thead>
            <tr className="bg-workspace text-left text-[10px] uppercase text-muted">
              <th className="p-3">Service</th>
              {data.markets.map((m: string) => (
                <th key={m} className="p-3 text-center">
                  Market {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.services.map((s: string) => (
              <tr key={s} className="border-t border-border">
                <td className="p-3 font-bold">{s}</td>
                {data.markets.map((m: string) => {
                  const c = data.cells.find(
                    (x: any) => x.service === s && x.market === m,
                  );
                  return (
                    <td key={m} className="p-2">
                      <button
                        onClick={() => onWork(c)}
                        className={`w-full rounded-md border p-3 text-center ${c.state === "strong" ? "border-success/25 bg-success/5" : c.state === "weak" ? "border-warning/25 bg-warning/5" : "border-critical/20 bg-critical/5"}`}
                      >
                        <b className="capitalize">{c.state}</b>
                        <div className="mt-1 text-[10px] text-muted">
                          {c.bestPosition ? `#${c.bestPosition}` : "No page"} ·
                          demand {c.demand}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function Ai({ data, onWork }: { data: any; onWork: (r: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="Checks" value={data.summary.checks} />
        <Mini label="Mention rate" value={`${data.summary.mentionRate}%`} />
        <Mini label="Citation rate" value={`${data.summary.citationRate}%`} />
        <Mini
          label="Share of Model Voice"
          value={`${data.summary.shareOfVoice}%`}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <Head
            title="Citation-source gaps"
            sub="Sources AI engines trust when they do not cite you"
          />
          <List
            title=""
            rows={data.sources.filter((x: any) => !x.owned)}
            action={onWork}
          />
        </Card>
        <Card>
          <Head
            title="Prompt opportunities"
            sub="Research prompts with an execution handoff"
          />
          <List title="" rows={data.opportunities} action={onWork} />
        </Card>
      </div>
    </div>
  );
}
function Builder({
  data,
  name,
  setName,
  widgets,
  setWidgets,
  save,
  remove,
  saving,
}: {
  data: any;
  name: string;
  setName: (x: string) => void;
  widgets: string[];
  setWidgets: (x: string[]) => void;
  save: () => void;
  remove: (id: string) => void;
  saving: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <Head
          title="Compose a dashboard"
          sub="Choose canonical metrics; saved views never embed provider payloads"
        />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {widgetOptions.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-xs font-semibold ${widgets.includes(m) ? "border-purple bg-purple/5 text-ink" : "border-border text-muted"}`}
            >
              <input
                type="checkbox"
                checked={widgets.includes(m)}
                onChange={() =>
                  setWidgets(
                    widgets.includes(m)
                      ? widgets.filter((x) => x !== m)
                      : [...widgets, m],
                  )
                }
              />
              {m.replace(/_/g, " ")}
            </label>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            Live preview
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((metric) => (
              <div key={metric} className="rounded-md bg-workspace p-3">
                <div className="text-[10px] font-semibold capitalize text-muted">
                  {metric.replace(/_/g, " ")}
                </div>
                <div className="mt-2 text-xl font-black text-ink">
                  {widgetValue(metric, data)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <input
            aria-label="Dashboard name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 flex-1 rounded-md border border-border px-3 text-xs"
          />
          <Button
            variant="primary"
            onClick={save}
            disabled={saving || !widgets.length}
          >
            <Save className="h-3.5 w-3.5" />
            Save dashboard
          </Button>
        </div>
      </Card>
      <Card>
        <Head
          title="Saved views"
          sub={`${data.dashboards.length} reusable dashboards`}
        />
        <div className="divide-y divide-border">
          {data.dashboards.map((d: any) => (
            <div key={d.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <b className="text-xs text-ink">{d.name}</b>
                <div className="mt-1 text-[10px] text-muted">
                  {d.widgets.length} widgets · {d.scopeType}
                </div>
              </div>
              <Button size="sm" onClick={() => remove(d.id)}>
                <Trash2 className="h-3 w-3" />
                Remove
              </Button>
            </div>
          ))}
          {!data.dashboards.length && (
            <div className="p-4 text-xs text-muted">
              Save the first reusable view from the preview.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
function widgetValue(metric: string, data: any) {
  if (metric === "share_of_voice")
    return `${data.shareOfVoice.leaders.find((item: any) => item.host === "owned")?.share ?? 0}%`;
  if (metric === "newcomers") return data.shareOfVoice.newcomers.length;
  if (metric === "publishing_velocity")
    return data.content
      .reduce(
        (sum: number, item: any) => sum + (item.publishingVelocity ?? 0),
        0,
      )
      .toFixed(1);
  if (metric === "link_opportunities") return data.links.intersect.length;
  if (metric === "coverage_gaps")
    return data.coverage.cells.filter((item: any) => item.state !== "strong")
      .length;
  if (metric === "ai_share_of_voice") return `${data.ai.summary.shareOfVoice}%`;
  if (metric === "verified_value") return data.datasets.outcomes.records;
  return data.forecasts.filter((item: any) => item.eligible).length || "Locked";
}
function Forecast({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-3">
      {rows.length ? (
        rows.map((r) => (
          <Card key={r.executionType}>
            <div className="grid gap-4 p-4 lg:grid-cols-[1fr_repeat(3,140px)]">
              <div>
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-purple" />
                  <b className="text-sm capitalize">
                    {r.executionType.replace(/_/g, " ")}
                  </b>
                  <StatusBadge
                    label={r.confidence}
                    tone={r.eligible ? "info" : "warning"}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {r.assumption}
                </p>
                <div className="mt-1 text-[10px] text-muted">
                  {r.samples} verified winning outcomes
                </div>
              </div>
              <Scenario label="Conservative" value={r.conservative} />
              <Scenario label="Base" value={r.base} />
              <Scenario label="Upside" value={r.upside} />
            </div>
          </Card>
        ))
      ) : (
        <EmptyState
          title="Forecasting is evidence-gated"
          description="At least three comparable verified winning outcomes are required before SEOcommand presents a scenario."
        />
      )}
    </div>
  );
}
function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="border-b border-border p-4">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <p className="mt-1 text-[10px] text-muted">{sub}</p>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] font-bold uppercase text-muted">{label}</div>
      <div className="mt-2 text-xl font-black tnum">{value}</div>
    </div>
  );
}
function List({
  title,
  rows,
  action,
}: {
  title: string;
  rows: any[];
  action: (x: any) => void;
}) {
  return (
    <div className="min-w-0 p-3">
      {title && (
        <div className="mb-2 text-[10px] font-bold uppercase text-muted">
          {title}
        </div>
      )}
      {rows?.length ? (
        rows.slice(0, 10).map((r: any, i: number) => (
          <div
            key={r.id ?? r.url ?? r.domain ?? r.keyword ?? i}
            className="flex items-start gap-2 border-t border-border py-2 first:border-0"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-ink">
                {r.url ?? r.sourceDomain ?? r.domain ?? r.prompt ?? r.keyword}
              </div>
              <div className="mt-1 text-[10px] text-muted">
                {r.traffic != null ? `${r.traffic} traffic · ` : ""}
                {r.authority != null ? `authority ${r.authority} · ` : ""}
                {r.reason ?? r.topic ?? r.status ?? "Stored evidence"}
              </div>
            </div>
            <Button size="sm" onClick={() => action(r)}>
              <Plus className="h-3 w-3" />
              Work
            </Button>
          </div>
        ))
      ) : (
        <div className="py-4 text-xs text-muted">No stored opportunities.</div>
      )}
    </div>
  );
}
function Scenario({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-workspace p-3 text-center">
      <div className="text-[10px] uppercase text-muted">{label}</div>
      <div className="mt-2 text-2xl font-black">
        {value == null ? "Locked" : `${value > 0 ? "+" : ""}${value}%`}
      </div>
    </div>
  );
}
