"use client";

import { useEffect, useState } from "react";
import {
  Bot, CheckCircle2, CircleAlert, ExternalLink, FileSearch, FolderSearch, Lightbulb,
  Link2, Loader2, MessageSquareText, Plus, Radar, Sparkles, Target, Users,
} from "lucide-react";
import { useDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { MultiLine } from "@/components/charts/charts";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { AiVisibilityDashboard } from "@/platform/ai-read-model";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Tab = "overview" | "prompts" | "sources" | "competitors" | "crawlers";
type Observation = AiVisibilityDashboard["observations"][number];
type Opportunity = AiVisibilityDashboard["opportunities"][number];

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "prompts", label: "Prompts", icon: MessageSquareText },
  { id: "sources", label: "Sources", icon: Link2 },
  { id: "competitors", label: "Share of voice", icon: Users },
  { id: "crawlers", label: "Crawler access", icon: Bot },
];
const AI_PLATFORMS = ["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"] as const;

const platformLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const pct = (value: number) => `${Math.round(value)}%`;

export default function AiVisibilityPage() {
  const { scope, activeDomain, activeGroup, sites } = useDomain();
  const [data, setData] = useState<AiVisibilityDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<Observation | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/ai-visibility?scope=${encodeURIComponent(scope)}&days=90`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        return body as AiVisibilityDashboard;
      })
      .then((body) => { if (active) { setData(body); setError(null); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, reload]);

  const scopeLabel = scope === "portfolio" ? "Portfolio" : scope.startsWith("group:") ? activeGroup?.name ?? "Portfolio group" : activeDomain?.name ?? String(scope);
  const subtitle = scope === "portfolio" ? `Across ${sites.length} websites` : scope.startsWith("group:") ? "Includes directly assigned websites and nested subgroups" : activeDomain?.host ?? "Selected website";

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={`${scopeLabel} — AI visibility`}
        description={`${subtitle}. Measure answers, citations, competitors and crawler readiness from one evidence trail.`}
        loading={loading}
      />

      <nav className="flex gap-1 overflow-x-auto rounded-md border border-border bg-card p-1" aria-label="AI visibility views">
        {TABS.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} onClick={() => setTab(item.id)} className={cn("inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium", tab === item.id ? "bg-rail text-white shadow-sm" : "text-muted hover:bg-workspace hover:text-ink")}><Icon className="h-3.5 w-3.5" />{item.label}</button>;
        })}
      </nav>

      {loading && !data ? <LoadingState /> : error ? <EmptyState title="AI visibility could not load" description={error} icon={<CircleAlert className="h-5 w-5" />} /> : !data ? null : (
        <>
          {tab === "overview" && <Overview data={data} onSelect={setSelected} />}
          {tab === "prompts" && <Prompts data={data} scope={scope} onAccepted={() => setReload((value) => value + 1)} />}
          {tab === "sources" && <Sources data={data} />}
          {tab === "competitors" && <Competitors data={data} />}
          {tab === "crawlers" && <CrawlerAccess data={data} />}
        </>
      )}

      <ObservationDrawer observation={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Overview({ data, onSelect }: { data: AiVisibilityDashboard; onSelect: (row: Observation) => void }) {
  if (!data.summary.checks) return <EmptyState title="No AI observations yet" description="Tracked prompts run after site spend is approved. Due prompts are checked daily, weekly or monthly according to their monitoring tier." icon={<Radar className="h-5 w-5" />} />;
  const columns: Column<Observation>[] = [
    { key: "prompt", header: "Latest measured answer", sortValue: (row) => row.prompt, render: (row) => <div className="max-w-md"><div className="truncate font-medium text-ink">{row.prompt}</div><div className="text-2xs text-muted">{row.siteName} · {row.topic}</div></div> },
    { key: "platform", header: "Platform", sortValue: (row) => row.platform, render: (row) => <StatusBadge label={platformLabel(row.platform)} tone="info" /> },
    { key: "mention", header: "Mention", sortValue: (row) => row.mentioned ? 1 : 0, render: (row) => <StatusBadge label={row.mentioned ? "Mentioned" : "Absent"} tone={row.mentioned ? "success" : "warning"} /> },
    { key: "citation", header: "Citation", sortValue: (row) => row.cited ? 1 : 0, render: (row) => <StatusBadge label={row.cited ? "Cited" : "Not cited"} tone={row.cited ? "success" : "neutral"} /> },
    { key: "position", header: "Rec. position", align: "right", sortValue: (row) => row.recommendationPosition ?? 999, render: (row) => row.recommendationPosition ? `#${row.recommendationPosition}` : "—" },
    { key: "date", header: "Checked", align: "right", sortValue: (row) => row.capturedOn, render: (row) => <span className="text-xs text-muted">{formatDate(row.capturedOn)}</span> },
  ];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <KpiCard label="Mention rate" value={pct(data.summary.mentionRate)} hint={`${data.summary.checks} measured responses`} accent />
      <KpiCard label="Citation rate" value={pct(data.summary.citationRate)} hint="Owned links in source evidence" />
      <KpiCard label="AI share of voice" value={pct(data.summary.shareOfVoice)} hint="Brand vs detected competitors" />
      <KpiCard label="Avg recommendation" value={data.summary.avgRecommendationPosition ? `#${data.summary.avgRecommendationPosition}` : "—"} hint="When included in a ranked answer" />
      <KpiCard label="Positive sentiment" value={pct(data.summary.positiveSentimentRate)} hint="Context around brand mentions" />
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
      <Card className="p-4"><div className="mb-2"><h2 className="text-sm font-semibold text-ink">Visibility movement</h2><p className="mt-0.5 text-2xs text-muted">Daily rates from immutable response observations · 90 days</p></div>{data.trend.length > 1 ? <MultiLine data={data.trend} height={250} series={[{ key: "mentionRate", name: "Mention rate", color: "#7137F5" }, { key: "citationRate", name: "Citation rate", color: "#16A477" }, { key: "shareOfVoice", name: "Share of voice", color: "#2563EB" }]} /> : <EmptyState title="Trend starts after the next run" description="One measurement date is stored. The second run creates movement." />}</Card>
      <Card className="overflow-hidden"><div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold text-ink">Platform coverage</h2><p className="mt-0.5 text-2xs text-muted">Every model is measured independently</p></div><div className="divide-y divide-border">{data.platforms.map((platform) => <div key={platform.platform} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="font-medium text-ink">{platformLabel(platform.platform)}</div><div className="text-2xs text-muted">{platform.checks} checks</div></div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><Metric label="Mention" value={pct(platform.mentionRate)} /><Metric label="Citation" value={pct(platform.citationRate)} /><Metric label="Avg pos." value={platform.avgPosition ? `#${platform.avgPosition}` : "—"} /></div></div>)}</div></Card>
    </div>

    {data.recommendations.length > 0 && <Card className="p-4"><div className="mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" /><div><h2 className="text-sm font-semibold text-ink">Evidence-led next actions</h2><p className="text-2xs text-muted">Suggestions stay review-only; no website change is published automatically.</p></div></div><div className="grid gap-2 md:grid-cols-2">{data.recommendations.map((item, index) => <div key={`${item.kind}-${index}`} className="rounded-md border border-border p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-ink">{item.title}</div><p className="mt-1 text-xs leading-relaxed text-muted">{item.detail}</p></div><span className="rounded-full bg-purple/10 px-2 py-1 text-2xs font-semibold text-purple">{item.priority}</span></div></div>)}</div></Card>}

    <Card className="p-4"><div className="mb-3"><h2 className="text-sm font-semibold text-ink">Latest response evidence</h2><p className="text-2xs text-muted">Open a row to inspect the answer, citations and detected entities.</p></div><DataTable rows={data.observations} columns={columns} searchKeys={(row) => `${row.prompt} ${row.topic} ${row.siteName} ${row.platform}`} onRowClick={onSelect} pageSize={12} exportName="ai-observations" /></Card>
  </div>;
}

function Prompts({ data, scope, onAccepted }: { data: AiVisibilityDashboard; scope: string; onAccepted: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [topic, setTopic] = useState("Custom");
  const [cadence, setCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [platforms, setPlatforms] = useState<string[]>(["chatgpt", "google_ai_overview", "google_ai_mode"]);
  async function accept(opportunity: Opportunity) {
    setBusy(opportunity.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/ai-opportunities/${opportunity.id}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platforms: ["chatgpt", "google_ai_overview", "google_ai_mode"], cadence: opportunity.priorityScore >= 80 ? "daily" : "weekly" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Prompt could not be added.");
      setMessage("Prompt added to the monitoring queue.");
      onAccepted();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }
  async function addCustomPrompt() {
    if (scope === "portfolio" || scope.startsWith("group:") || customPrompt.trim().length < 8) return;
    setBusy("custom");
    setMessage(null);
    try {
      const response = await fetch("/api/ai-prompts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteSlug: scope, prompt: customPrompt, topic, cadence, platforms, priority: cadence === "daily" ? 90 : cadence === "weekly" ? 60 : 40 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Prompt could not be added.");
      setCustomPrompt("");
      setAdding(false);
      onAccepted();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }
  const suggested = data.opportunities.filter((item) => item.status !== "accepted").slice(0, 30);
  return <>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_360px]">
      <Card className="p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-ink">Discovered prompt opportunities</h2><p className="mt-0.5 text-2xs text-muted">Generated from Search Console demand, keyword data and AI fan-out queries. An operator chooses what becomes tracked.</p></div>{scope !== "portfolio" && !scope.startsWith("group:") && <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add prompt</Button>}</div>{suggested.length ? <div className="divide-y divide-border rounded-md border border-border">{suggested.map((item) => <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-medium text-ink">{item.prompt}</div><div className="mt-1 flex flex-wrap gap-1.5"><StatusBadge label={item.source} tone="info" /><span className="text-2xs text-muted">Priority {item.priorityScore}{item.aiSearchVolume ? ` · ${item.aiSearchVolume.toLocaleString()} demand` : ""}</span></div></div><Button size="sm" onClick={() => accept(item)} disabled={busy === item.id}>{busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Track</Button></div>)}</div> : <EmptyState title="No prompt opportunities yet" description="The next GSC, keyword or AI run will seed this queue." icon={<FolderSearch className="h-5 w-5" />} />}{message && <p className="mt-3 text-xs text-muted">{message}</p>}</Card>
      <div className="space-y-4"><Card className="overflow-hidden"><div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold text-ink">Tracking queue</h2><p className="text-2xs text-muted">{data.trackedPrompts.length} prompts in this scope</p></div><div className="max-h-80 divide-y divide-border overflow-y-auto">{data.trackedPrompts.slice(0, 30).map((item) => <div key={item.id} className="px-4 py-3"><div className="line-clamp-2 text-xs font-medium text-ink">{item.prompt}</div><div className="mt-1.5 flex items-center justify-between gap-2"><StatusBadge label={item.cadence} tone={item.active ? "success" : "neutral"} /><span className="text-2xs text-muted">{item.platforms.length} platforms · P{item.priority}</span></div></div>)}</div></Card><Card className="p-4"><Target className="h-5 w-5 text-purple" /><h2 className="mt-3 text-sm font-semibold text-ink">Monitoring policy</h2><div className="mt-3 space-y-2 text-xs text-muted"><Policy label="Daily" detail="Highest-value brand and conversion prompts" /><Policy label="Weekly" detail="Core category and comparison prompts" /><Policy label="Monthly" detail="Long-tail discovery and exploration" /></div></Card><Card className="p-4"><h2 className="text-sm font-semibold text-ink">Current scope</h2><p className="mt-2 text-xs leading-relaxed text-muted">{scope === "portfolio" || scope.startsWith("group:") ? "Prompt creation is assigned to a website. Select a single website to add a manual prompt; discovered prompts retain their source website." : "Use discovered prompts here or add a custom question for this website."}</p></Card></div>
    </div>
    <Drawer open={adding} onClose={() => setAdding(false)} title="Add a tracked prompt" subtitle="Choose exactly where and how often this question is measured">
      <div className="space-y-4"><label className="block"><span className="text-xs font-semibold text-ink">Prompt</span><textarea rows={4} value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} className="mt-1.5 w-full rounded-md border border-border p-3 text-sm text-ink focus:border-purple focus:outline-none" placeholder="What are the best…?" /></label><label className="block"><span className="text-xs font-semibold text-ink">Topic</span><input value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1.5 h-9 w-full rounded-md border border-border px-3 text-sm focus:border-purple focus:outline-none" /></label><label className="block"><span className="text-xs font-semibold text-ink">Cadence</span><select value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)} className="mt-1.5 h-9 w-full rounded-md border border-border px-3 text-sm"><option value="daily">Daily · highest priority</option><option value="weekly">Weekly · standard</option><option value="monthly">Monthly · exploratory</option></select></label><div><div className="text-xs font-semibold text-ink">Platforms</div><div className="mt-2 flex flex-wrap gap-2">{AI_PLATFORMS.map((platform) => <button type="button" key={platform} onClick={() => setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform])} className={cn("rounded-md border px-2.5 py-2 text-xs", platforms.includes(platform) ? "border-purple bg-purple/5 text-purple" : "border-border text-muted")}>{platformLabel(platform)}</button>)}</div></div><Button variant="primary" onClick={addCustomPrompt} disabled={busy === "custom" || customPrompt.trim().length < 8 || platforms.length === 0}>{busy === "custom" && <Loader2 className="h-4 w-4 animate-spin" />} Add to tracking</Button></div>
    </Drawer>
  </>;
}

function Sources({ data }: { data: AiVisibilityDashboard }) {
  const columns: Column<AiVisibilityDashboard["sources"][number]>[] = [
    { key: "domain", header: "Cited source", sortValue: (row) => row.domain, render: (row) => <div className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-muted" /><div><div className="font-medium text-ink">{row.domain}</div><div className="text-2xs text-muted">{row.urls.length} sampled URLs</div></div>{row.owned && <StatusBadge label="Owned" tone="success" />}</div> },
    { key: "citations", header: "Citations", align: "right", sortValue: (row) => row.citations, render: (row) => row.citations },
    { key: "platforms", header: "Platforms", render: (row) => <div className="flex flex-wrap gap-1">{row.platforms.map((item) => <StatusBadge key={item} label={platformLabel(item)} tone="info" />)}</div> },
    { key: "prompts", header: "Prompt coverage", align: "right", sortValue: (row) => row.prompts.length, render: (row) => row.prompts.length },
    { key: "url", header: "Evidence", align: "right", render: (row) => row.urls[0] ? <a href={row.urls[0]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-purple hover:underline">Open source <ExternalLink className="h-3 w-3" /></a> : "—" },
  ];
  return <Card className="p-4"><div className="mb-3"><h2 className="text-sm font-semibold text-ink">Citation source graph</h2><p className="mt-0.5 text-2xs text-muted">Structured URLs extracted from answer annotations and search evidence—not inferred from response text.</p></div>{data.sources.length ? <DataTable rows={data.sources} columns={columns} searchKeys={(row) => `${row.domain} ${row.prompts.join(" ")}`} pageSize={20} exportName="ai-citation-sources" /> : <EmptyState title="No structured citations captured yet" description="Run web-enabled prompts or Google AI results to populate the source graph." icon={<FileSearch className="h-5 w-5" />} />}</Card>;
}

function Competitors({ data }: { data: AiVisibilityDashboard }) {
  return <div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><div className="mb-4"><h2 className="text-sm font-semibold text-ink">Entity share of voice</h2><p className="mt-0.5 text-2xs text-muted">Detected brand mentions in the measured answer set.</p></div>{data.competitors.length ? <div className="space-y-3">{data.competitors.slice(0, 20).map((item) => <div key={item.host ?? item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", item.owned ? "bg-purple" : "bg-[#9AA5B8]")} /><span className="font-medium text-ink">{item.name}</span>{item.owned && <span className="text-2xs text-purple">Owned</span>}</div><span className="font-semibold text-ink tnum">{pct(item.shareOfVoice)}</span></div><div className="h-2 overflow-hidden rounded-full bg-workspace"><div className={cn("h-full rounded-full", item.owned ? "bg-purple" : "bg-[#9AA5B8]")} style={{ width: `${Math.max(2, item.shareOfVoice)}%` }} /></div></div>)}</div> : <EmptyState title="No competitor entities detected" description="Competitors discovered during keyword sync are matched against future AI responses." icon={<Users className="h-5 w-5" />} />}</Card><Card className="p-4"><h2 className="text-sm font-semibold text-ink">How this is calculated</h2><div className="mt-4 space-y-4"><Explainer number="1" title="Detect" copy="Match the owned brand and known competitor entities inside each measured response." /><Explainer number="2" title="Place" copy="Read numbered recommendations where present and retain the entity’s position." /><Explainer number="3" title="Compare" copy="Divide each entity’s measured mentions by all owned and competitor mentions in the scope." /></div></Card></div>;
}

function CrawlerAccess({ data }: { data: AiVisibilityDashboard }) {
  return <Card className="p-4"><div className="mb-3"><h2 className="text-sm font-semibold text-ink">AI crawler access</h2><p className="mt-0.5 text-2xs text-muted">Latest robots.txt policy observed for search, assistant and training agents. “Allowed” confirms root access; path-specific rules may still apply.</p></div>{data.crawlerAudit.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.crawlerAudit.map((row) => <div key={`${row.siteSlug}-${row.bot}`} className="rounded-md border border-border p-3"><div className="flex items-start justify-between gap-2"><div><div className="font-medium text-ink">{row.bot}</div><div className="text-2xs text-muted">{row.siteName} · {row.category}</div></div><StatusBadge label={row.access} tone={row.access === "allowed" ? "success" : row.access === "blocked" ? "critical" : "warning"} /></div><p className="mt-3 text-xs leading-relaxed text-muted">{row.evidence}</p></div>)}</div> : <EmptyState title="Crawler audit not recorded yet" description="The daily worker checks each website’s robots.txt without consuming provider credits." icon={<Bot className="h-5 w-5" />} />}</Card>;
}

function ObservationDrawer({ observation, onClose }: { observation: Observation | null; onClose: () => void }) {
  return <Drawer open={observation != null} onClose={onClose} title="Measured AI response" subtitle={observation ? `${observation.siteName} · ${platformLabel(observation.platform)}` : undefined} width="max-w-2xl">{observation && <div className="space-y-2"><DrawerField label="Prompt">{observation.prompt}</DrawerField><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Mention" value={observation.mentioned ? "Yes" : "No"} /><Metric label="Citation" value={observation.cited ? "Yes" : "No"} /><Metric label="Position" value={observation.recommendationPosition ? `#${observation.recommendationPosition}` : "—"} /><Metric label="Sentiment" value={observation.sentiment} /></div><DrawerField label="Response evidence"><div className="max-h-80 overflow-y-auto rounded-md border border-border bg-workspace p-3"><p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{observation.responseText || "No answer text was returned."}</p></div></DrawerField><DrawerField label="Structured citations">{observation.citations.length ? <div className="space-y-2">{observation.citations.map((citation) => <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-xs hover:bg-workspace"><span className="min-w-0 truncate text-ink">{citation.title || citation.domain}</span><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" /></a>)}</div> : <span className="text-muted">No linked source annotations were returned.</span>}</DrawerField><DrawerField label="Fan-out queries">{observation.fanOutQueries.length ? <div className="flex flex-wrap gap-1.5">{observation.fanOutQueries.map((query) => <span key={query} className="rounded-full border border-border bg-workspace px-2 py-1 text-xs text-muted">{query}</span>)}</div> : <span className="text-muted">None returned by this provider.</span>}</DrawerField></div>}</Drawer>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div><div className="mt-0.5 text-sm font-semibold capitalize text-ink tnum">{value}</div></div>; }
function Policy({ label, detail }: { label: string; detail: string }) { return <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /><div><span className="font-medium text-ink">{label}</span><span> · {detail}</span></div></div>; }
function Explainer({ number, title, copy }: { number: string; title: string; copy: string }) { return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple/10 text-xs font-semibold text-purple">{number}</span><div><div className="text-sm font-medium text-ink">{title}</div><p className="mt-0.5 text-xs leading-relaxed text-muted">{copy}</p></div></div>; }
function LoadingState() { return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div><Skeleton className="h-80" /></div>; }
