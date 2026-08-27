"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CircleDollarSign, GitPullRequest, Globe2, Loader2, PlugZap, Radar, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, StatusBadge } from "@/components/ui/primitives";
import { MARKETS } from "@/lib/markets";
import type { GooglePropertyDiscovery, PortfolioGroup, SiteCostForecast } from "@/platform/types";
import { cn } from "@/lib/cn";

const STEPS = ["Website", "Tracking", "Google", "Connections", "Forecast"] as const;
const AI_PLATFORMS = ["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"] as const;
const ALERT_CHANNELS = ["in_app", "whatsapp", "email"] as const;

interface Draft {
  name: string;
  host: string;
  industry: string;
  marketCode: number;
  devices: ("desktop" | "mobile")[];
  trackedKeywords: number;
  crawlMaxPages: number;
  backlinkLimit: number;
  aiPrompts: number;
  aiPlatforms: (typeof AI_PLATFORMS)[number][];
  gscProperty: string;
  ga4Property: string;
  connectionKind: "github" | "hostinger_git" | "webhook";
  connectionUrl: string;
  alertChannels: (typeof ALERT_CHANNELS)[number][];
  emailRecipients: string;
  whatsappRecipients: string;
  groupIds: string[];
}

const initial: Draft = {
  name: "",
  host: "",
  industry: "",
  marketCode: 2784,
  devices: ["desktop", "mobile"],
  trackedKeywords: 100,
  crawlMaxPages: 10000,
  backlinkLimit: 10000,
  aiPrompts: 10,
  aiPlatforms: [...AI_PLATFORMS],
  gscProperty: "",
  ga4Property: "",
  connectionKind: "github",
  connectionUrl: "",
  alertChannels: [...ALERT_CHANNELS],
  emailRecipients: "",
  whatsappRecipients: "",
  groupIds: [],
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="block text-2xs text-muted">{hint}</span>}
    </label>
  );
}

const inputClass = "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink placeholder:text-muted focus:border-purple focus:outline-none";

export default function NewSitePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initial);
  const [discovery, setDiscovery] = useState<GooglePropertyDiscovery | null>(null);
  const [forecast, setForecast] = useState<SiteCostForecast | null>(null);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);

  useEffect(() => {
    fetch("/api/portfolio-groups")
      .then((response) => response.ok ? response.json() : { groups: [] })
      .then((body: { groups?: PortfolioGroup[] }) => setGroups(body.groups ?? []))
      .catch(() => undefined);
  }, []);

  const market = useMemo(() => MARKETS.find((item) => item.code === draft.marketCode) ?? MARKETS[0]!, [draft.marketCode]);

  function toggle<T extends string>(values: T[], value: T): T[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  }

  function canContinue(): boolean {
    if (step === 0) return draft.name.trim().length > 1 && draft.host.includes(".") && draft.industry.trim().length > 1;
    if (step === 1) return draft.devices.length > 0 && draft.aiPlatforms.length > 0;
    if (step === 3) return draft.alertChannels.length > 0 && (draft.connectionUrl.length === 0 || /^https?:\/\//.test(draft.connectionUrl));
    return true;
  }

  async function next() {
    setError(null);
    if (!canContinue()) {
      setError("Complete the required fields before continuing.");
      return;
    }
    if (step === 1 && !discovery) {
      setBusy(true);
      try {
        const response = await fetch(`/api/sites/discover-google?host=${encodeURIComponent(draft.host)}`);
        if (!response.ok) throw new Error("Google property discovery failed.");
        const body = (await response.json()) as GooglePropertyDiscovery;
        setDiscovery(body);
        const gsc = body.gsc.find((item) => item.matched);
        const ga4 = body.ga4.find((item) => item.matched);
        setDraft((value) => ({ ...value, gscProperty: gsc?.id ?? value.gscProperty, ga4Property: ga4?.id ?? value.ga4Property }));
      } catch (reason) {
        setDiscovery({ configured: false, gsc: [], ga4: [], warnings: [reason instanceof Error ? reason.message : String(reason)] });
      } finally {
        setBusy(false);
      }
    }
    if (step === 3) await loadForecast();
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  }

  async function loadForecast() {
    setBusy(true);
    try {
      const response = await fetch("/api/sites/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackedKeywords: draft.trackedKeywords,
          crawlMaxPages: draft.crawlMaxPages,
          backlinkLimit: draft.backlinkLimit,
          aiPrompts: draft.aiPrompts,
          aiPlatforms: draft.aiPlatforms.length,
          devices: draft.devices,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Cost forecast failed.");
      setForecast(body.forecast);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    setBusy(true);
    setError(null);
    try {
      const connection = draft.connectionUrl
        ? [{ kind: draft.connectionKind, displayName: draft.connectionKind === "github" ? "GitHub repository" : draft.connectionKind === "hostinger_git" ? "Hostinger Git deployment" : "Site webhook", remoteUrl: draft.connectionUrl }]
        : [];
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          host: draft.host,
          industry: draft.industry,
          market: market.label,
          locationCode: market.code,
          languageCode: market.language,
          devices: draft.devices,
          gscProperty: draft.gscProperty || null,
          ga4Property: draft.ga4Property || null,
          trackedKeywords: draft.trackedKeywords,
          crawlMaxPages: draft.crawlMaxPages,
          backlinkLimit: draft.backlinkLimit,
          aiPrompts: draft.aiPrompts,
          aiPlatforms: draft.aiPlatforms,
          connections: connection,
          alertChannels: draft.alertChannels,
          emailRecipients: draft.emailRecipients.split(",").map((item) => item.trim()).filter(Boolean),
          whatsappRecipients: draft.whatsappRecipients.split(",").map((item) => item.trim()).filter(Boolean),
          groupIds: draft.groupIds,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Site could not be created.");
      setSiteSlug(body.site.slug);
      setForecast(body.forecast);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!siteSlug || !forecast) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteSlug}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", approvedMonthlyUsd: forecast.highUsd }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Approval failed.");
      router.push("/sites");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader title="Add a website" description="Discover properties, choose tracking, connect delivery, forecast cost, then approve the first scan." />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <ol className="grid grid-cols-5 gap-2" aria-label="Onboarding progress">
              {STEPS.map((label, index) => (
                <li key={label} className="min-w-0">
                  <div className={cn("mb-2 h-1 rounded-full", index <= step ? "bg-purple" : "bg-border")} />
                  <div className={cn("truncate text-2xs font-medium", index === step ? "text-purple" : "text-muted")}>{index + 1}. {label}</div>
                </li>
              ))}
            </ol>
          </div>

          <div className="min-h-[430px] p-5 sm:p-7">
            {step === 0 && (
              <div className="max-w-2xl space-y-5">
                <StepTitle icon={<Globe2 />} title="Which website are we adding?" copy="The host becomes the stable portfolio identity. No provider calls happen yet." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Website name"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Mortgage Compare" /></Field>
                  <Field label="Website host" hint="Use the root domain without a path."><input className={inputClass} value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="example.com" /></Field>
                </div>
                <Field label="Industry and service" hint="Used to seed competitor and AI visibility discovery."><input className={inputClass} value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} placeholder="UAE mortgage comparison" /></Field>
                {groups.length > 0 && <div><div className="mb-1.5 text-xs font-semibold text-ink">Portfolio placement <span className="font-normal text-muted">· optional</span></div><div className="flex flex-wrap gap-2">{groups.map((group) => <button key={group.id} type="button" onClick={() => setDraft({ ...draft, groupIds: toggle(draft.groupIds, group.id) })} className={cn("inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium", draft.groupIds.includes(group.id) ? "border-purple bg-purple/5 text-purple" : "border-border text-muted hover:text-ink")}><span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />{group.name}{draft.groupIds.includes(group.id) && <Check className="h-3.5 w-3.5" />}</button>)}</div><p className="mt-1.5 text-2xs text-muted">Choose one or more groups now; you can reorganise the site later without changing its tracking.</p></div>}
              </div>
            )}

            {step === 1 && (
              <div className="max-w-3xl space-y-5">
                <StepTitle icon={<Radar />} title="Set the tracking footprint" copy="These choices drive daily ranking volume and the monthly cost forecast." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Primary search market"><select className={inputClass} value={draft.marketCode} onChange={(e) => setDraft({ ...draft, marketCode: Number(e.target.value) })}>{MARKETS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></Field>
                  <Field label="Tracked keywords"><input type="number" min={1} max={5000} className={inputClass} value={draft.trackedKeywords} onChange={(e) => setDraft({ ...draft, trackedKeywords: Number(e.target.value) })} /></Field>
                  <Field label="Maximum crawl pages"><input type="number" min={100} max={100000} step={100} className={inputClass} value={draft.crawlMaxPages} onChange={(e) => setDraft({ ...draft, crawlMaxPages: Number(e.target.value) })} /></Field>
                  <Field label="Backlink ledger limit"><input type="number" min={1000} max={100000} step={1000} className={inputClass} value={draft.backlinkLimit} onChange={(e) => setDraft({ ...draft, backlinkLimit: Number(e.target.value) })} /></Field>
                </div>
                <ChoiceRow label="Ranking devices" values={["desktop", "mobile"] as const} selected={draft.devices} onToggle={(value) => setDraft({ ...draft, devices: toggle(draft.devices, value) })} />
                <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                  <Field label="AI prompts"><input type="number" min={0} max={100} className={inputClass} value={draft.aiPrompts} onChange={(e) => setDraft({ ...draft, aiPrompts: Number(e.target.value) })} /></Field>
                  <ChoiceRow label="AI visibility models" values={AI_PLATFORMS} selected={draft.aiPlatforms} onToggle={(value) => setDraft({ ...draft, aiPlatforms: toggle(draft.aiPlatforms, value) })} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="max-w-3xl space-y-5">
                <StepTitle icon={<PlugZap />} title="Confirm Google properties" copy="Likely matches are selected automatically. You can leave either property blank and connect it later." />
                {busy ? <Loading label="Discovering accessible GSC and GA4 properties…" /> : (
                  <>
                    {discovery?.warnings.map((warning) => <div key={warning} className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-[#8A6016]">{warning}</div>)}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Search Console property"><select className={inputClass} value={draft.gscProperty} onChange={(e) => setDraft({ ...draft, gscProperty: e.target.value })}><option value="">Connect later</option>{discovery?.gsc.map((item) => <option key={item.id} value={item.id}>{item.matched ? "Suggested · " : ""}{item.label}</option>)}</select></Field>
                      <Field label="GA4 property"><select className={inputClass} value={draft.ga4Property} onChange={(e) => setDraft({ ...draft, ga4Property: e.target.value })}><option value="">Connect later</option>{discovery?.ga4.map((item) => <option key={item.id} value={item.id}>{item.matched ? "Suggested · " : ""}{item.label}</option>)}</select></Field>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="max-w-3xl space-y-5">
                <StepTitle icon={<GitPullRequest />} title="Connect its source or deployment" copy="SEOcommand creates reviewable change proposals. It never publishes website changes automatically." />
                <div className="grid gap-4 sm:grid-cols-3">
                  {(["github", "hostinger_git", "webhook"] as const).map((kind) => (
                    <button key={kind} type="button" onClick={() => setDraft({ ...draft, connectionKind: kind })} className={cn("rounded-md border p-4 text-left", draft.connectionKind === kind ? "border-purple bg-purple/5" : "border-border hover:bg-workspace")}>
                      <div className="text-sm font-semibold text-ink">{kind === "github" ? "GitHub repository" : kind === "hostinger_git" ? "Hostinger Git" : "API / webhook"}</div>
                      <div className="mt-1 text-2xs text-muted">{kind === "github" ? "Draft branches or pull requests" : kind === "hostinger_git" ? "Review changes before deployment" : "Signed proposal payloads"}</div>
                    </button>
                  ))}
                </div>
                <Field label="Connection URL" hint="Optional now. Credentials are referenced from the deployment secret store, never saved here."><input className={inputClass} value={draft.connectionUrl} onChange={(e) => setDraft({ ...draft, connectionUrl: e.target.value })} placeholder={draft.connectionKind === "github" ? "https://github.com/owner/repository" : "https://…"} /></Field>
                <ChoiceRow label="Alert delivery" values={ALERT_CHANNELS} selected={draft.alertChannels} onToggle={(value) => setDraft({ ...draft, alertChannels: toggle(draft.alertChannels, value) })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {draft.alertChannels.includes("email") && <Field label="Email recipients" hint="Comma-separated"><input className={inputClass} value={draft.emailRecipients} onChange={(e) => setDraft({ ...draft, emailRecipients: e.target.value })} placeholder="seo@example.com" /></Field>}
                  {draft.alertChannels.includes("whatsapp") && <Field label="WhatsApp recipients" hint="International numbers, comma-separated"><input className={inputClass} value={draft.whatsappRecipients} onChange={(e) => setDraft({ ...draft, whatsappRecipients: e.target.value })} placeholder="+971…" /></Field>}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="max-w-3xl space-y-5">
                <StepTitle icon={<CircleDollarSign />} title="Review cost and activate paid monitoring" copy="The website becomes active immediately with any connected free data. This forecast controls only paid provider work." />
                {busy && !forecast ? <Loading label="Calculating monthly provider usage…" /> : forecast && (
                  <>
                    <div className="rounded-md border border-purple/20 bg-purple/5 p-5">
                      <div className="text-2xs font-semibold uppercase tracking-wider text-purple">Expected monthly provider cost</div>
                      <div className="mt-1 text-3xl font-semibold tracking-tight text-ink">${forecast.monthlyUsd.toFixed(2)}</div>
                      <div className="mt-1 text-xs text-muted">Expected range ${forecast.lowUsd.toFixed(2)}–${forecast.highUsd.toFixed(2)}. Approval uses the upper bound.</div>
                    </div>
                    <div className="divide-y divide-border rounded-md border border-border">
                      {forecast.lines.map((line) => (
                        <div key={line.key} className="flex items-start justify-between gap-4 px-4 py-3">
                          <div><div className="text-sm font-medium text-ink">{line.label}</div><div className="text-2xs text-muted">{line.note} · {line.cadence}</div></div>
                          <div className="font-medium text-ink tnum">${line.monthlyUsd.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                    {!siteSlug ? (
                      <Button variant="primary" onClick={createDraft} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add website</Button>
                    ) : (
                      <div className="rounded-md border border-success/25 bg-success/5 p-4">
                        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-success" /><div><div className="text-sm font-semibold text-ink">Website active · free monitoring started</div><p className="mt-1 text-xs text-muted">Connected GSC, GA4 and free reliability checks can run now. Approving a ${forecast.highUsd.toFixed(2)} monthly ceiling also queues paid crawl, keyword, competitor, backlink and AI work.</p></div></div>
                        <div className="mt-4 flex flex-wrap gap-2"><Button variant="primary" onClick={approve} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Approve and queue paid scan</Button><Button onClick={() => router.push(`/sites/${siteSlug}`)}>Open website without paid scan</Button></div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {error && <div role="alert" className="mt-5 rounded-md border border-critical/25 bg-critical/5 p-3 text-xs text-critical">{error}</div>}
          </div>

          {!siteSlug && (
            <div className="flex items-center justify-between border-t border-border bg-workspace/50 px-5 py-4">
              <Button variant="ghost" onClick={() => step === 0 ? router.push("/sites") : setStep((value) => value - 1)}><ChevronLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}</Button>
              {step < STEPS.length - 1 && <Button variant="primary" onClick={next} disabled={busy}><span>Continue</span>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}</Button>}
            </div>
          )}
        </Card>

        <aside className="space-y-3">
          <Card className="p-4">
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Launch policy</div>
            <div className="mt-3 space-y-3 text-xs text-muted">
              <Policy text="No paid request before approval" />
              <Policy text="Free connectors start immediately" />
              <Policy text="Initial scan runs in the job queue" />
              <Policy text="Website changes stay review-only" />
              <Policy text="Actual cost is ledgered per site" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-semibold text-ink">What starts automatically</div>
            <p className="mt-2 text-xs leading-relaxed text-muted">GSC, GA4 and reliability monitoring start when available. Paid crawling, rank tracking, competitor gaps, backlinks, Local SEO and AI visibility wait for budget approval.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StepTitle({ icon, title, copy }: { icon: React.ReactElement; title: string; copy: string }) {
  return <div className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-purple/10 text-purple">{icon}</div><div><h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2><p className="mt-1 text-xs text-muted">{copy}</p></div></div>;
}

function ChoiceRow<T extends string>({ label, values, selected, onToggle }: { label: string; values: readonly T[]; selected: T[]; onToggle: (value: T) => void }) {
  return <div><div className="mb-1.5 text-xs font-semibold text-ink">{label}</div><div className="flex flex-wrap gap-2">{values.map((value) => <button key={value} type="button" onClick={() => onToggle(value)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium capitalize", selected.includes(value) ? "border-purple bg-purple/5 text-purple" : "border-border bg-card text-muted hover:text-ink")}>{selected.includes(value) && <Check className="h-3.5 w-3.5" />}{value.replace(/_/g, " ")}</button>)}</div></div>;
}

function Policy({ text }: { text: string }) {
  return <div className="flex items-center gap-2"><Check className="h-3.5 w-3.5 shrink-0 text-success" /><span>{text}</span></div>;
}

function Loading({ label }: { label: string }) {
  return <div className="flex items-center gap-2 rounded-md border border-border bg-workspace p-4 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin text-purple" />{label}</div>;
}
