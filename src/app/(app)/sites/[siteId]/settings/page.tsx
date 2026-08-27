"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Activity, Bell, Check, ChevronRight, CircleDollarSign, Cloud, Code2, Database,
  FolderTree, Gauge, Globe2, History, KeyRound, MapPinned, PlugZap, Save, Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { useDomain } from "@/components/shell/domain-context";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "targeting", label: "Groups & targeting", icon: FolderTree },
  { id: "strategy", label: "Search strategy", icon: SlidersHorizontal },
  { id: "monitoring", label: "Monitoring", icon: Activity },
  { id: "local", label: "Local SEO", icon: MapPinned },
  { id: "budget", label: "Budget & usage", icon: CircleDollarSign },
  { id: "connections", label: "Connections", icon: PlugZap },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "access", label: "Access & audit", icon: KeyRound },
] as const;
type TabId = (typeof TABS)[number]["id"];
type ConnectionKind = "github" | "hostinger_git" | "webhook";

interface SiteRow {
  slug: string; name: string; host: string; accent: string; industry: string;
  primaryMarket: string; locationCode: number; languageCode: string;
  devices: ("desktop" | "mobile")[]; gscProperty: string | null; ga4Property: string | null;
  lifecycleStatus: "active" | "pre_launch" | "paused" | "archived";
  spendApproval: "draft" | "pending" | "approved" | "rejected";
  forecastMonthlyUsd: number; approvedMonthlyUsd: number | null;
  budgetLimits: Record<string, number | null>; monitoringSchedule: Record<string, unknown>;
  siteSettings: Record<string, unknown>; crawlMaxPages: number; backlinkLimit: number;
}
interface Connection {
  id: string; kind: ConnectionKind; status: string; displayName: string; remoteUrl: string | null;
  config: Record<string, unknown>; lastCheckedAt: string | null;
}
interface Group { id: string; name: string; color: string; parentId: string | null; }
interface NotificationRule {
  channels: string[]; recipients: string[]; eventTypes: string[]; rankDropThreshold: number; trafficDropPct: number; enabled: boolean;
}
interface AuditEvent { id: string; actorEmail: string | null; actorRole: string | null; action: string; area: string; summary: string; createdAt: string; }
interface SettingsData {
  site: SiteRow; connections: Connection[]; groupIds: string[]; groups: Group[];
  notificationRule: NotificationRule | null; spend: { month: string; totalUsd: number; lines: { endpoint: string; spentUsd: number }[] };
  auditEvents: AuditEvent[]; credentialPolicy: string;
}

const DEFAULT_EVENTS = ["rank_drop", "technical_regression", "traffic_drop", "site_unavailable", "tls_risk", "lost_backlink", "local_rating_drop"];
const BUDGET_CATEGORIES = [
  ["rankings", "Rankings"], ["crawling", "Technical crawling"], ["backlinks", "Backlinks"],
  ["competitors", "Competitors"], ["ai", "AI visibility"], ["local_seo", "Local SEO"],
] as const;

export default function SiteSettingsPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = String(params?.siteId ?? "");
  const { setScope } = useDomain();
  const [tab, setTab] = useState<TabId>("general");
  const [data, setData] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<SiteRow | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [rule, setRule] = useState<NotificationRule | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function load() {
    Promise.all([
      fetch(`/api/sites/${siteId}/settings`).then((response) => response.ok ? response.json() : Promise.reject(new Error("Website settings could not be loaded."))),
      fetch("/api/auth/session").then((response) => response.json()),
    ]).then(([settings, session]: [SettingsData, { user?: { role?: string } }]) => {
      setData(settings); setDraft(settings.site); setGroupIds(settings.groupIds);
      setRule(settings.notificationRule ?? { channels: ["in_app", "email"], recipients: [], eventTypes: DEFAULT_EVENTS, rankDropThreshold: 5, trafficDropPct: 20, enabled: true });
      setRole(session.user?.role ?? null); setScope(siteId);
    }).catch((error: Error) => setNotice({ tone: "error", text: error.message }));
  }
  useEffect(load, [siteId, setScope]);

  const canEdit = role === "admin" || role === "seo_analyst";
  const canBudget = role === "admin" || role === "manager";
  const monthlyLimit = draft?.approvedMonthlyUsd ?? 0;
  const proposedMonthlyLimit = draft?.approvedMonthlyUsd ?? draft?.forecastMonthlyUsd ?? 0;
  const budgetValid = Boolean(draft && proposedMonthlyLimit >= draft.forecastMonthlyUsd);
  const usedPct = monthlyLimit > 0 ? Math.min(100, ((data?.spend.totalUsd ?? 0) / monthlyLimit) * 100) : 0;

  async function save(body: Record<string, unknown>) {
    setSaving(true); setNotice(null);
    const response = await fetch(`/api/sites/${siteId}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { error?: string; synthetic?: boolean; settings?: SettingsData };
    setSaving(false);
    if (!response.ok) return setNotice({ tone: "error", text: result.error ?? "Settings could not be saved." });
    setNotice({ tone: "success", text: "Saved. The change is recorded in the audit history." });
    if (result.synthetic && result.settings) {
      setData(result.settings);
      setDraft(result.settings.site);
      setGroupIds(result.settings.groupIds);
      setRule(result.settings.notificationRule ?? rule);
      return;
    }
    load();
  }

  if (!data || !draft || !rule) {
    return <div className="space-y-5"><Skeleton className="h-20" /><div className="grid gap-5 lg:grid-cols-[240px_1fr]"><Skeleton className="h-96" /><Skeleton className="h-[560px]" /></div>{notice && <EmptyState title="Settings unavailable" description={notice.text} />}</div>;
  }

  return (
    <div className="animate-in space-y-6">
      <PageHeader title={`${draft.name} settings`} description="Website-specific controls for data collection, spend, connectors, alerting and access. Paid work remains approval-gated." actions={<StatusBadge label={draft.lifecycleStatus} tone={draft.lifecycleStatus === "active" ? "success" : draft.lifecycleStatus === "paused" ? "warning" : "neutral"} />} />
      {notice && <div role="status" className={cn("flex items-center gap-2 rounded-md border px-4 py-3 text-xs font-semibold", notice.tone === "success" ? "border-success/25 bg-success/10 text-success" : "border-critical/25 bg-critical/10 text-critical")}>{notice.tone === "success" && <Check className="h-4 w-4" />}{notice.text}</div>}
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit p-2 lg:sticky lg:top-4">
          <nav aria-label="Website settings" className="space-y-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold", tab === item.id ? "bg-ink text-card" : "text-muted hover:bg-workspace hover:text-ink")}><Icon className={cn("h-4 w-4", tab === item.id && "text-[#7FE4EA]")} /><span className="flex-1">{item.label}</span><ChevronRight className="h-3.5 w-3.5 opacity-45" /></button>;
            })}
          </nav>
        </Card>

        <div className="min-w-0">
          {tab === "general" && <SettingsPanel title="General" description="Identity, lifecycle and visual marker for this website." icon={<Globe2 className="h-5 w-5" />}>
            <FieldGrid>
              <Field label="Website name"><Input value={draft.name} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, name: value })} /></Field>
              <Field label="Website host"><Input value={draft.host} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, host: value })} /></Field>
              <Field label="Industry"><Input value={draft.industry} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, industry: value })} /></Field>
              <Field label="Lifecycle"><Select value={draft.lifecycleStatus} disabled={!canEdit} options={["active", "pre_launch", "paused", "archived"]} onChange={(value) => setDraft({ ...draft, lifecycleStatus: value as SiteRow["lifecycleStatus"] })} /></Field>
              <Field label="Website colour"><div className="flex gap-2"><input type="color" value={draft.accent} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, accent: event.target.value })} className="h-10 w-12 rounded-md border border-border bg-card p-1" /><Input value={draft.accent} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, accent: value })} /></div></Field>
            </FieldGrid>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={() => save({ section: "general", name: draft.name, host: draft.host, industry: draft.industry, primaryMarket: draft.primaryMarket, locationCode: draft.locationCode, languageCode: draft.languageCode, devices: draft.devices, lifecycleStatus: draft.lifecycleStatus, accent: draft.accent })} />
          </SettingsPanel>}

          {tab === "targeting" && <SettingsPanel title="Groups & targeting" description="Place this website in multiple portfolio groups and define its search market." icon={<MapPinned className="h-5 w-5" />}>
            <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.groups.map((group) => <label key={group.id} className={cn("flex cursor-pointer items-center gap-3 rounded-md border p-3", groupIds.includes(group.id) ? "border-purple bg-purple/5" : "border-border")}><input type="checkbox" disabled={!canEdit} checked={groupIds.includes(group.id)} onChange={() => setGroupIds((values) => values.includes(group.id) ? values.filter((id) => id !== group.id) : [...values, group.id])} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} /><span className="text-sm font-semibold text-ink">{group.name}</span></label>)}</div>
            <FieldGrid>
              <Field label="Primary market"><Input value={draft.primaryMarket} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, primaryMarket: value })} /></Field>
              <Field label="Location code"><NumberInput value={draft.locationCode} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, locationCode: value })} /></Field>
              <Field label="Language"><Input value={draft.languageCode} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, languageCode: value })} /></Field>
              <Field label="Devices"><div className="flex gap-2">{(["desktop", "mobile"] as const).map((device) => <button key={device} disabled={!canEdit} onClick={() => setDraft({ ...draft, devices: draft.devices.includes(device) ? draft.devices.filter((value) => value !== device) : [...draft.devices, device] })} className={cn("rounded-md border px-3 py-2 text-xs font-semibold capitalize", draft.devices.includes(device) ? "border-purple bg-purple/10 text-purple" : "border-border text-muted")}>{device}</button>)}</div></Field>
            </FieldGrid>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={async () => { await save({ section: "groups", groupIds }); await save({ section: "general", name: draft.name, host: draft.host, industry: draft.industry, primaryMarket: draft.primaryMarket, locationCode: draft.locationCode, languageCode: draft.languageCode, devices: draft.devices, lifecycleStatus: draft.lifecycleStatus, accent: draft.accent }); }} />
          </SettingsPanel>}

          {tab === "monitoring" && <SettingsPanel title="Monitoring" description="Cadence and capacity controls for rankings, crawl, links, AI, Local SEO and reliability." icon={<Gauge className="h-5 w-5" />}>
            <FieldGrid>
              {["rankings", "crawling", "backlinks", "competitors", "ai", "localSeo"].map((key) => <Field key={key} label={key.replace(/([A-Z])/g, " $1")}><Select disabled={!canEdit} value={String(draft.monitoringSchedule[key] ?? "weekly")} options={["daily", "weekly", "monthly"]} onChange={(value) => setDraft({ ...draft, monitoringSchedule: { ...draft.monitoringSchedule, [key]: value } })} /></Field>)}
              <Field label="Reliability"><Select disabled={!canEdit} value={String(draft.monitoringSchedule.reliability ?? "hourly")} options={["hourly", "daily"]} onChange={(value) => setDraft({ ...draft, monitoringSchedule: { ...draft.monitoringSchedule, reliability: value } })} /></Field>
              <Field label="Crawl page limit"><NumberInput disabled={!canEdit} value={draft.crawlMaxPages} onChange={(value) => setDraft({ ...draft, crawlMaxPages: value })} /></Field>
              <Field label="Backlink row limit"><NumberInput disabled={!canEdit} value={draft.backlinkLimit} onChange={(value) => setDraft({ ...draft, backlinkLimit: value })} /></Field>
            </FieldGrid>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={() => save({ section: "monitoring", monitoringSchedule: draft.monitoringSchedule, siteSettings: draft.siteSettings, crawlMaxPages: draft.crawlMaxPages, backlinkLimit: draft.backlinkLimit })} />
          </SettingsPanel>}

          {tab === "strategy" && <SettingsPanel title="Search strategy" description="The website's managed keyword set and named competitors. One item per line keeps bulk editing predictable." icon={<SlidersHorizontal className="h-5 w-5" />}>
            <div className="grid gap-5 xl:grid-cols-2">
              <TextList label="Tracked keywords" value={listText(draft.siteSettings.trackedKeywords)} disabled={!canEdit} placeholder={"mortgage comparison\nbest mortgage rates\nmortgage calculator"} onChange={(values) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, trackedKeywords: values } })} />
              <TextList label="Competitor domains" value={listText(draft.siteSettings.competitors)} disabled={!canEdit} placeholder={"competitor-one.com\ncompetitor-two.com"} onChange={(values) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, competitors: values } })} />
              <TextList label="Priority topics" value={listText(draft.siteSettings.priorityTopics)} disabled={!canEdit} placeholder={"First-time buyers\nRemortgaging\nBuy-to-let"} onChange={(values) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, priorityTopics: values } })} />
              <Field label="Cannibalisation sensitivity"><Select disabled={!canEdit} value={String(draft.siteSettings.cannibalisationSensitivity ?? "balanced")} options={["conservative", "balanced", "sensitive"]} onChange={(value) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, cannibalisationSensitivity: value } })} /></Field>
            </div>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={() => save({ section: "monitoring", monitoringSchedule: draft.monitoringSchedule, siteSettings: draft.siteSettings, crawlMaxPages: draft.crawlMaxPages, backlinkLimit: draft.backlinkLimit })} />
          </SettingsPanel>}

          {tab === "local" && <SettingsPanel title="Local SEO" description="Public business identity, tracked locations and map-grid defaults for this website." icon={<MapPinned className="h-5 w-5" />}>
            <FieldGrid>
              <Field label="Public business name"><Input disabled={!canEdit} value={String(draft.siteSettings.businessName ?? "")} onChange={(value) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, businessName: value } })} /></Field>
              <Field label="Google Place ID"><Input disabled={!canEdit} value={String(draft.siteSettings.googlePlaceId ?? "")} onChange={(value) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, googlePlaceId: value } })} /></Field>
              <Field label="Map grid size"><Select disabled={!canEdit} value={String(draft.siteSettings.localGridSize ?? "3x3")} options={["3x3", "5x5"]} onChange={(value) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, localGridSize: value } })} /></Field>
              <Field label="Default radius (km)"><NumberInput disabled={!canEdit} value={Number(draft.siteSettings.localRadiusKm ?? 5)} step={0.5} onChange={(value) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, localRadiusKm: value } })} /></Field>
            </FieldGrid>
            <div className="mt-5"><TextList label="Tracked locations" value={listText(draft.siteSettings.localLocations)} disabled={!canEdit} placeholder={"Dubai, UAE\nAbu Dhabi, UAE"} onChange={(values) => setDraft({ ...draft, siteSettings: { ...draft.siteSettings, localLocations: values } })} /></div>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={() => save({ section: "monitoring", monitoringSchedule: draft.monitoringSchedule, siteSettings: draft.siteSettings, crawlMaxPages: draft.crawlMaxPages, backlinkLimit: draft.backlinkLimit })} />
          </SettingsPanel>}

          {tab === "budget" && <SettingsPanel title="Budget & usage" description="A hard monthly ceiling plus optional category limits. Free GSC, GA4 and reliability checks continue if paid work pauses." icon={<CircleDollarSign className="h-5 w-5" />}>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Metric label="Forecast" value={`$${draft.forecastMonthlyUsd.toFixed(2)}`} color="#335CFF" />
              <Metric label="Approved ceiling" value={draft.approvedMonthlyUsd == null ? "Not set" : `$${draft.approvedMonthlyUsd.toFixed(2)}`} color="#F2B544" />
              <Metric label={`Used · ${data.spend.month}`} value={`$${data.spend.totalUsd.toFixed(2)}`} color={usedPct >= 90 ? "#FF5C62" : "#16A879"} />
            </div>
            <div className="mb-6"><div className="mb-2 flex justify-between text-2xs font-semibold text-muted"><span>Monthly usage</span><span>{usedPct.toFixed(0)}%</span></div><div className="h-3 overflow-hidden rounded-full bg-workspace"><div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: usedPct >= 90 ? "#FF5C62" : usedPct >= 70 ? "#F2B544" : "#16A879" }} /></div></div>
            <Field label="Website monthly ceiling (USD)"><NumberInput disabled={!canBudget} value={proposedMonthlyLimit} step={0.01} onChange={(value) => setDraft({ ...draft, approvedMonthlyUsd: value })} /></Field>
            <h3 className="mb-3 mt-6 text-sm font-bold text-ink">Optional category limits</h3>
            <div className="grid gap-3 sm:grid-cols-2">{BUDGET_CATEGORIES.map(([key, label]) => <Field key={key} label={label}><NumberInput disabled={!canBudget} value={draft.budgetLimits[key] ?? 0} step={0.01} onChange={(value) => setDraft({ ...draft, budgetLimits: { ...draft.budgetLimits, [key]: value || null } })} /></Field>)}</div>
            <div className={cn("mt-6 rounded-md border p-4 text-xs leading-5 text-ink", budgetValid ? "border-warning/30 bg-warning/10" : "border-critical/30 bg-critical/10")}><strong>Forecast before approval:</strong> {budgetValid ? "changing cadence or volume updates the forecast first. Paid jobs only run after an Admin or Owner approves the ceiling." : `set a ceiling of at least $${draft.forecastMonthlyUsd.toFixed(2)} before approval.`}</div>
            <SaveBar canSave={canBudget && budgetValid} saving={saving} role={role} onSave={() => save({ section: "budget", approvedMonthlyUsd: proposedMonthlyLimit, budgetLimits: draft.budgetLimits, spendApproval: "approved" })} label="Approve budget" />
          </SettingsPanel>}

          {tab === "connections" && <SettingsPanel title="Connections" description={data.credentialPolicy} icon={<PlugZap className="h-5 w-5" />}>
            <div className="grid gap-4 xl:grid-cols-2">
              <ConnectorCard icon={<Cloud />} name="Google Search Console" status={draft.gscProperty ? "connected" : "needs setup"} detail={draft.gscProperty || "Map a central Google property"} color="#335CFF">
                <Input disabled={!canEdit} value={draft.gscProperty ?? ""} placeholder="sc-domain:example.com" onChange={(value) => setDraft({ ...draft, gscProperty: value || null })} />
              </ConnectorCard>
              <ConnectorCard icon={<Database />} name="Google Analytics 4" status={draft.ga4Property ? "connected" : "needs setup"} detail={draft.ga4Property || "Map a GA4 property ID"} color="#F2B544">
                <Input disabled={!canEdit} value={draft.ga4Property ?? ""} placeholder="123456789" onChange={(value) => setDraft({ ...draft, ga4Property: value || null })} />
              </ConnectorCard>
              <ConnectorCard icon={<Database />} name="DataForSEO" status={draft.spendApproval === "approved" ? "approved" : "spend gated"} detail="Central credential · paid jobs respect this site's budget" color="#16A879" />
              {(["github", "hostinger_git", "webhook"] as const).map((kind) => {
                const existing = data.connections.find((item) => item.kind === kind);
                return <EditableConnector key={kind} kind={kind} existing={existing} canEdit={canEdit} saving={saving} onSave={(remoteUrl) => save({ section: "connection", connection: { kind, displayName: kind === "github" ? "GitHub repository" : kind === "hostinger_git" ? "Hostinger Git deployment" : "Generic webhook", remoteUrl: remoteUrl || null, status: remoteUrl ? "connected" : "pending", config: { publishMode: "review_only" } } })} />;
              })}
            </div>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={() => save({ section: "google", gscProperty: draft.gscProperty, ga4Property: draft.ga4Property })} label="Save Google mappings" />
          </SettingsPanel>}

          {tab === "alerts" && <SettingsPanel title="Alerts" description="Route meaningful changes to the in-app centre and email. WhatsApp can remain off until configured." icon={<Bell className="h-5 w-5" />}>
            <div className="mb-6 flex flex-wrap gap-2">{["in_app", "email", "whatsapp"].map((channel) => <button key={channel} disabled={!canEdit} onClick={() => setRule({ ...rule, channels: rule.channels.includes(channel) ? rule.channels.filter((value) => value !== channel) : [...rule.channels, channel] })} className={cn("rounded-md border px-3 py-2 text-xs font-semibold", rule.channels.includes(channel) ? "border-purple bg-purple/10 text-purple" : "border-border text-muted")}>{channel.replace("_", " ")}</button>)}</div>
            <FieldGrid>
              <Field label="Rank drop threshold"><NumberInput disabled={!canEdit} value={rule.rankDropThreshold} onChange={(value) => setRule({ ...rule, rankDropThreshold: value })} /></Field>
              <Field label="Traffic drop %"><NumberInput disabled={!canEdit} value={rule.trafficDropPct} onChange={(value) => setRule({ ...rule, trafficDropPct: value })} /></Field>
              <Field label="Recipients"><Input disabled={!canEdit} value={rule.recipients.join(", ")} placeholder="email:name@example.com" onChange={(value) => setRule({ ...rule, recipients: value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
              <Field label="Rule status"><Select disabled={!canEdit} value={rule.enabled ? "enabled" : "disabled"} options={["enabled", "disabled"]} onChange={(value) => setRule({ ...rule, enabled: value === "enabled" })} /></Field>
            </FieldGrid>
            <SaveBar canSave={canEdit} saving={saving} role={role} onSave={() => save({ section: "alerts", ...rule })} />
          </SettingsPanel>}

          {tab === "access" && <SettingsPanel title="Access & audit" description="Owners can view all evidence and approve budgets. Admins and SEO operators can change operational settings." icon={<History className="h-5 w-5" />}>
            <div className="mb-6 grid gap-3 sm:grid-cols-3"><AccessRole label="Admin" detail="Full access and budget approval" color="#335CFF" /><AccessRole label="SEO operator" detail="Operational changes; no budget approval" color="#12B8C4" /><AccessRole label="Owner" detail="Read-only plus budget approval" color="#F2B544" /></div>
            <h3 className="mb-3 text-sm font-bold text-ink">Recent changes</h3>
            {data.auditEvents.length === 0 ? <EmptyState title="No recorded changes yet" description="Settings and notification decisions will be recorded here." /> : <div className="divide-y divide-border rounded-md border border-border">{data.auditEvents.map((event) => <div key={event.id} className="flex gap-3 p-3"><span className="mt-1 h-2 w-2 rounded-full bg-[#12B8C4]" /><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-ink">{event.summary}</div><div className="mt-1 text-[10px] text-muted">{event.actorEmail || "System"} · {event.actorRole?.replace("_", " ") || "system"} · {new Date(event.createdAt).toLocaleString()}</div></div><StatusBadge label={event.area} /></div>)}</div>}
          </SettingsPanel>}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <Card className="overflow-hidden"><div className="flex gap-3 border-b border-border px-5 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-purple/10 text-purple">{icon}</span><div><h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{description}</p></div></div><div className="p-5">{children}</div></Card>;
}
function FieldGrid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">{label}</span>{children}</label>; }
function Input({ value, onChange, disabled, placeholder }: { value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string }) { return <input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple disabled:bg-workspace disabled:text-muted" />; }
function NumberInput({ value, onChange, disabled, step = 1 }: { value: number; onChange: (value: number) => void; disabled?: boolean; step?: number }) { return <input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple disabled:bg-workspace disabled:text-muted" />; }
function Select({ value, options, onChange, disabled }: { value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) { return <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm capitalize text-ink outline-none focus:border-purple disabled:bg-workspace disabled:text-muted">{options.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}</select>; }
function SaveBar({ canSave, saving, role, onSave, label = "Save changes" }: { canSave: boolean; saving: boolean; role: string | null; onSave: () => void; label?: string }) { return <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-2xs text-muted">{canSave ? "Changes are audited and apply only to this website." : `Your ${role === "manager" ? "Owner" : "Viewer"} role is read-only for this section.`}</p><Button variant="primary" disabled={!canSave || saving} onClick={onSave}><Save className="h-4 w-4" />{saving ? "Saving…" : label}</Button></div>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <div className="rounded-md border border-border p-4"><div className="mb-3 h-1.5 w-10 rounded-full" style={{ background: color }} /><div className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</div><div className="mt-1 text-xl font-extrabold text-ink tnum">{value}</div></div>; }
function ConnectorCard({ icon, name, status, detail, color, children }: { icon: React.ReactNode; name: string; status: string; detail: string; color: string; children?: React.ReactNode }) { return <div className="rounded-lg border border-border p-4"><div className="flex gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: `${color}18`, color }}>{icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-ink">{name}</h3><StatusBadge label={status} tone={status === "connected" || status === "approved" ? "success" : "warning"} /></div><p className="mt-1 truncate text-2xs text-muted" title={detail}>{detail}</p></div></div>{children && <div className="mt-4">{children}</div>}</div>; }
function EditableConnector({ kind, existing, canEdit, saving, onSave }: { kind: ConnectionKind; existing?: Connection; canEdit: boolean; saving: boolean; onSave: (url: string) => void }) {
  const [url, setUrl] = useState(existing?.remoteUrl ?? "");
  const label = kind === "github" ? "GitHub" : kind === "hostinger_git" ? "Hostinger Git" : "Webhook";
  return <ConnectorCard icon={<Code2 />} name={label} status={existing?.status ?? "needs setup"} detail={existing?.lastCheckedAt ? `Checked ${new Date(existing.lastCheckedAt).toLocaleString()}` : "Review-only connection"} color={kind === "github" ? "#172033" : kind === "hostinger_git" ? "#FF6B5E" : "#12B8C4"}><div className="flex gap-2"><Input value={url} disabled={!canEdit} placeholder="https://…" onChange={setUrl} /><Button disabled={!canEdit || saving} onClick={() => onSave(url)}>Save</Button></div></ConnectorCard>;
}
function AccessRole({ label, detail, color }: { label: string; detail: string; color: string }) { return <div className="rounded-md border border-border p-4"><span className="mb-3 block h-2 w-2 rounded-full" style={{ background: color }} /><div className="text-sm font-bold text-ink">{label}</div><div className="mt-1 text-2xs leading-4 text-muted">{detail}</div></div>; }
function listText(value: unknown): string { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : ""; }
function TextList({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (values: string[]) => void; disabled?: boolean; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">{label}</span><textarea rows={6} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-muted focus:border-purple disabled:bg-workspace disabled:text-muted" /></label>;
}
