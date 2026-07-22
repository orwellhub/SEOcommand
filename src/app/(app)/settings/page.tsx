"use client";

import { useMemo, useState } from "react";
import {
  Globe,
  PlugZap,
  MapPin,
  CalendarClock,
  Users,
  Wallet,
  Bell,
  History,
  Plus,
  Monitor,
  Smartphone,
  Check,
  Circle,
  ShieldAlert,
  Lock,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  SectionTitle,
  SeverityBadge,
  StatusBadge,
  Button,
  EmptyState,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { UsageMeter } from "@/components/ui/usage-meter";
import { DOMAINS, getDomain } from "@/data/domains";
import { SEED } from "@/data/seed";
import { currency, fullNumber } from "@/lib/format";
import { relativeFromNow } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Domain, ProviderConnection, UsageLedgerEntry } from "@/lib/types";

/* ---------------------------------------------------------------------- */
/* Local, self-contained demo primitives (read-only visual affordances)   */
/* ---------------------------------------------------------------------- */

function ReadOnlySwitch({ on, label }: { on: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          on ? "bg-success" : "bg-workspace border border-border",
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      {label && <span className="text-xs text-muted">{label}</span>}
    </span>
  );
}

function ToggleRow({
  title,
  detail,
  on,
}: {
  title: string;
  detail: string;
  on: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-2xs text-muted">{detail}</div>
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-2xs font-medium text-muted">{on ? "On" : "Off"}</span>
        <ReadOnlySwitch on={on} />
      </div>
    </div>
  );
}

function ConnStateChip({ label, on }: { label: string; on: boolean }) {
  return (
    <StatusBadge label={on ? label : `${label}: off`} tone={on ? "success" : "neutral"} />
  );
}

/* ---------------------------------------------------------------------- */
/* Sub-navigation                                                         */
/* ---------------------------------------------------------------------- */

type SectionId =
  | "domains"
  | "connections"
  | "locations"
  | "crawl"
  | "users"
  | "usage"
  | "notifications"
  | "sync";

const SECTIONS: { id: SectionId; label: string; icon: typeof Globe; hint: string }[] = [
  { id: "domains", label: "Domains & properties", icon: Globe, hint: "Portfolio registry" },
  { id: "connections", label: "Data connections", icon: PlugZap, hint: "Providers & OAuth" },
  { id: "locations", label: "Locations & devices", icon: MapPin, hint: "Tracking targets" },
  { id: "crawl", label: "Crawl & frequency", icon: CalendarClock, hint: "Schedules" },
  { id: "users", label: "Users & roles", icon: Users, hint: "Access control" },
  { id: "usage", label: "Usage & guardrails", icon: Wallet, hint: "Cost controls" },
  { id: "notifications", label: "Notifications & alerts", icon: Bell, hint: "Rules & feed" },
  { id: "sync", label: "Sync history & cache", icon: History, hint: "Logs & retention" },
];

/* ---------------------------------------------------------------------- */
/* Static demo configuration                                              */
/* ---------------------------------------------------------------------- */

interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "seo_analyst" | "viewer";
}

const DEMO_USERS: DemoUser[] = [
  { id: "u-1", name: "Orwell Admin", email: "admin@orwell.demo", role: "admin" },
];

const ROLE_PERMISSIONS: Record<DemoUser["role"], string> = {
  admin: "Settings, providers, domains, users and all data across the portfolio.",
  manager: "All domains, reports, approvals and tasks. No provider/user administration.",
  seo_analyst: "Research, analysis, recommendations and tasks for assigned domains.",
  viewer: "Read-only access to dashboards and reports.",
};

const ROLE_TONE: Record<DemoUser["role"], "info" | "success" | "warning" | "neutral"> = {
  admin: "info",
  manager: "success",
  seo_analyst: "warning",
  viewer: "neutral",
};

const CRAWL_SETTINGS: { title: string; cadence: string; detail: string }[] = [
  {
    title: "Technical site crawl",
    cadence: "Weekly (default)",
    detail: "Full on-page + Core Web Vitals crawl. Configurable per domain once connected.",
  },
  {
    title: "Rank tracking",
    cadence: "Daily",
    detail: "Desktop + mobile SERP positions across all tracked keywords.",
  },
  {
    title: "Backlink change detection",
    cadence: "Daily",
    detail: "New, lost and toxic referring-domain deltas.",
  },
  {
    title: "Competitor refresh",
    cadence: "Weekly",
    detail: "Share-of-voice, overlap and authority recomputation.",
  },
  {
    title: "AI-prompt visibility checks",
    cadence: "Configurable",
    detail: "Mention & citation checks across AI platforms on a per-prompt schedule.",
  },
];

const REQUEST_MODES: { id: string; label: string; detail: string }[] = [
  { id: "normal", label: "Normal", detail: "Cached-first, batched — lowest cost." },
  { id: "priority", label: "Priority", detail: "Faster refresh, higher per-request cost." },
  { id: "live", label: "Live", detail: "Bypass cache — real-time, most expensive." },
];

const NOTIFICATION_RULES: { title: string; detail: string; on: boolean }[] = [
  { title: "Ranking gains", detail: "Keyword enters top 3 or top 10.", on: true },
  { title: "Ranking losses", detail: "Keyword drops out of top 10 or 5+ positions.", on: true },
  { title: "New backlinks", detail: "New referring domain acquired.", on: true },
  { title: "Lost backlinks", detail: "Previously active link removed.", on: true },
  { title: "Technical criticals", detail: "New critical or high site-audit issue.", on: true },
  { title: "Budget thresholds", detail: "Spend crosses 50 / 75 / 90 / 100%.", on: true },
];

const BUDGET_THRESHOLDS = [50, 75, 90, 100];

/* ---------------------------------------------------------------------- */
/* Page                                                                   */
/* ---------------------------------------------------------------------- */

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("domains");
  const [connectDrawer, setConnectDrawer] = useState<ProviderConnection | null>(null);
  const [emergencyPaused, setEmergencyPaused] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  const usageLedger = SEED.usageLedger;

  // Illustrative sub-budgets that sum to the $200 global guardrail.
  const perDomainBudgets = useMemo(() => {
    const splits: Record<string, number> = {
      mortgagecompare: 80,
      busrentalglobal: 60,
      pettransportglobal: 60,
    };
    return DOMAINS.map((d) => ({ domain: d, limit: splits[d.id] ?? 0 }));
  }, []);

  const totalRequests = useMemo(
    () => usageLedger.reduce((sum, e) => sum + e.requests, 0),
    [usageLedger],
  );

  const ledgerColumns: Column<UsageLedgerEntry>[] = [
    { key: "date", header: "Date", sortValue: (r) => r.date, render: (r) => r.date },
    {
      key: "provider",
      header: "Provider",
      sortValue: (r) => r.provider,
      render: (r) => <span className="capitalize">{r.provider}</span>,
    },
    { key: "module", header: "Module", sortValue: (r) => r.module, render: (r) => r.module },
    {
      key: "domain",
      header: "Domain",
      sortValue: (r) => (r.domainId === "portfolio" ? "Portfolio" : getDomain(r.domainId).name),
      render: (r) => (r.domainId === "portfolio" ? "Portfolio" : getDomain(r.domainId).name),
    },
    {
      key: "requests",
      header: "Requests",
      align: "right",
      sortValue: (r) => r.requests,
      render: (r) => fullNumber(r.requests),
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      sortValue: (r) => r.cost,
      render: (r) => <span className={r.cost === 0 ? "text-muted" : "text-ink"}>{currency(r.cost)}</span>,
    },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Settings & cost controls"
        description="Portfolio-level configuration: data providers, tracking, access control and spending guardrails. Everything here is a read-only demo of the production control surface — no live credentials or spend."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left sub-nav */}
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden p-1.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    active ? "bg-workspace" : "hover:bg-workspace/60",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-purple" : "text-muted")} />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        active ? "font-semibold text-ink" : "text-ink",
                      )}
                    >
                      {s.label}
                    </span>
                    <span className="block truncate text-2xs text-muted">{s.hint}</span>
                  </span>
                </button>
              );
            })}
          </Card>
        </nav>

        {/* Right content */}
        <div className="min-w-0 space-y-5">
          {section === "domains" && <DomainsSection />}
          {section === "connections" && (
            <ConnectionsSection onConnect={setConnectDrawer} />
          )}
          {section === "locations" && <LocationsSection />}
          {section === "crawl" && <CrawlSection />}
          {section === "users" && <UsersSection />}
          {section === "usage" && (
            <UsageSection
              perDomainBudgets={perDomainBudgets}
              ledger={usageLedger}
              ledgerColumns={ledgerColumns}
              totalRequests={totalRequests}
              emergencyPaused={emergencyPaused}
              onToggleEmergency={() => setEmergencyPaused((v) => !v)}
            />
          )}
          {section === "notifications" && <NotificationsSection />}
          {section === "sync" && (
            <SyncSection
              cacheCleared={cacheCleared}
              onClearCache={() => setCacheCleared(true)}
            />
          )}
        </div>
      </div>

      {/* Connection drawer */}
      <Drawer
        open={connectDrawer !== null}
        onClose={() => setConnectDrawer(null)}
        title={connectDrawer ? `Connect ${connectDrawer.label}` : "Connect provider"}
        subtitle="Demo — no credentials are captured or transmitted"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted">
              <Lock className="h-3.5 w-3.5" /> Secrets are stored server-side, never in the browser.
            </span>
            <Button variant="secondary" onClick={() => setConnectDrawer(null)}>
              Close
            </Button>
          </div>
        }
      >
        {connectDrawer && <ConnectDrawerBody conn={connectDrawer} />}
      </Drawer>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 1. Domains & properties                                                */
/* ---------------------------------------------------------------------- */

function DomainsSection() {
  const columns: Column<Domain>[] = [
    {
      key: "name",
      header: "Domain",
      sortValue: (d) => d.name,
      render: (d) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.accent }} />
          <div>
            <div className="font-medium text-ink">{d.name}</div>
            <div className="text-2xs text-muted">{d.host}</div>
          </div>
        </div>
      ),
    },
    { key: "industry", header: "Industry", sortValue: (d) => d.industry, render: (d) => d.industry },
    {
      key: "market",
      header: "Primary market",
      sortValue: (d) => d.primaryMarket,
      render: (d) => d.primaryMarket,
    },
    {
      key: "connections",
      header: "Connections",
      render: (d) => {
        const any = d.gscConnected || d.ga4Connected || d.dataForSeoConnected;
        if (!any) return <StatusBadge label="Not connected" tone="neutral" />;
        return (
          <div className="flex flex-wrap gap-1">
            <ConnStateChip label="GSC" on={d.gscConnected} />
            <ConnStateChip label="GA4" on={d.ga4Connected} />
            <ConnStateChip label="DataForSEO" on={d.dataForSeoConnected} />
          </div>
        );
      },
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Domains & properties</h3>
          <p className="text-2xs text-muted">
            {DOMAINS.length} domains in the pilot portfolio. The registry is data-driven — adding a
            domain scales every module automatically.
          </p>
        </div>
        <Button variant="primary" size="sm">
          <Plus className="h-3.5 w-3.5" /> Add domain
        </Button>
      </div>
      <DataTable rows={DOMAINS} columns={columns} exportName="domains" pageSize={10} />
      <p className="mt-3 text-2xs text-muted">
        All pilot domains are currently unconnected — modules render seeded demo data until providers
        are activated under Data connections.
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* 2. Data connections                                                    */
/* ---------------------------------------------------------------------- */

function ConnectionsSection({
  onConnect,
}: {
  onConnect: (c: ProviderConnection) => void;
}) {
  const conns = SEED.providerConnections;

  return (
    <div className="space-y-5">
      <Card className="border-warning/30 bg-warning/5 p-4">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#B9791A]" />
          <div>
            <div className="text-sm font-medium text-ink">No live connections are active.</div>
            <p className="text-2xs text-muted">
              Every provider below is disconnected. Nothing on this screen implies a live data feed —
              the whole application is running on deterministic demo data.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {conns.map((c) => (
          <Card key={c.id} className="flex flex-col p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="text-sm font-semibold text-ink">{c.label}</div>
              <StatusBadge label={c.status} tone="neutral" />
            </div>
            <p className="flex-1 text-2xs text-muted">{c.detail}</p>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-2xs text-muted">
                {c.lastSync ? `Synced ${relativeFromNow(c.lastSync)}` : "Never synced"}
              </span>
              <Button variant="primary" size="sm" onClick={() => onConnect(c)}>
                Connect
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Property mapping</h3>
          <p className="text-2xs text-muted">
            Read-only — GSC and GA4 properties are mapped per domain after OAuth completes.
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-workspace/70 text-left text-2xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">Domain</th>
                <th className="px-3 py-2.5">GSC property</th>
                <th className="px-3 py-2.5">GA4 property</th>
              </tr>
            </thead>
            <tbody>
              {DOMAINS.map((d) => (
                <tr key={d.id} className="border-b border-border/70 last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.accent }} />
                      <span className="font-medium text-ink">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted">To be mapped after connection</td>
                  <td className="px-3 py-2.5 text-muted">To be mapped after connection</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ConnectDrawerBody({ conn }: { conn: ProviderConnection }) {
  const isDfs = conn.provider === "dataforseo";
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-workspace/50 p-3">
        <StatusBadge label={conn.status} tone="neutral" />
        <p className="mt-2 text-xs text-muted">{conn.detail}</p>
      </div>

      <div>
        <SectionTitle>What connecting requires</SectionTitle>
        <dl className="mt-2 divide-y divide-border">
          {isDfs ? (
            <>
              <DrawerField label="API login">
                DataForSEO account login — stored encrypted server-side, never exposed to the browser.
              </DrawerField>
              <DrawerField label="API password">
                Paired API password / key — held in the server secret store.
              </DrawerField>
              <DrawerField label="Base URL">
                API base endpoint (e.g. https://api.dataforseo.com). Requests are proxied server-side.
              </DrawerField>
            </>
          ) : (
            <>
              <DrawerField label="OAuth authorisation">
                Google OAuth consent grants read access to your {conn.label} data. Tokens are stored
                server-side and refreshed automatically.
              </DrawerField>
              <DrawerField label="Property selection">
                After consent, select the {conn.provider === "google-analytics" ? "GA4 property" : "Search Console property"}
                {" "}to map to each domain.
              </DrawerField>
              <DrawerField label="Scope">
                Read-only analytics scope. No write access is requested.
              </DrawerField>
            </>
          )}
        </dl>
      </div>

      <div className="rounded-md border border-dashed border-border p-3 text-2xs text-muted">
        This is a demo boundary. The connect action is intentionally inert — no fields are rendered,
        no secrets are captured, and no network request is made.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 3. Locations & devices                                                 */
/* ---------------------------------------------------------------------- */

function LocationsSection() {
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Tracked locations</h3>
          <p className="text-2xs text-muted">
            Read-only demo config — one primary market per domain drives SERP location targeting.
          </p>
        </div>
        <div className="divide-y divide-border">
          {DOMAINS.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-muted" />
                <div>
                  <div className="text-sm font-medium text-ink">{d.name}</div>
                  <div className="text-2xs text-muted">{d.host}</div>
                </div>
              </div>
              <StatusBadge label={d.primaryMarket} tone="info" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Devices</h3>
          <p className="text-2xs text-muted">Both device profiles are tracked for every keyword.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { icon: Monitor, label: "Desktop", detail: "Desktop SERP + Core Web Vitals" },
            { icon: Smartphone, label: "Mobile", detail: "Mobile-first SERP + CWV" },
          ].map((dev) => {
            const Icon = dev.icon;
            return (
              <div
                key={dev.label}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-purple" />
                  <div>
                    <div className="text-sm font-medium text-ink">{dev.label}</div>
                    <div className="text-2xs text-muted">{dev.detail}</div>
                  </div>
                </div>
                <ReadOnlySwitch on label="Tracked" />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 4. Crawl settings & tracking frequency                                 */
/* ---------------------------------------------------------------------- */

function CrawlSection() {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">Crawl settings & tracking frequency</h3>
        <p className="text-2xs text-muted">
          Read-only demo schedules. Cadences become editable per domain once providers are connected.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {CRAWL_SETTINGS.map((c) => (
          <div key={c.title} className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-ink">{c.title}</div>
              <StatusBadge label={c.cadence} tone="info" />
            </div>
            <p className="mt-1.5 text-2xs text-muted">{c.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* 5. Users & roles                                                       */
/* ---------------------------------------------------------------------- */

function UsersSection() {
  const columns: Column<DemoUser>[] = [
    {
      key: "name",
      header: "User",
      sortValue: (u) => u.name,
      render: (u) => (
        <div>
          <div className="font-medium text-ink">{u.name}</div>
          <div className="text-2xs text-muted">{u.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (u) => u.role,
      render: (u) => <StatusBadge label={u.role} tone={ROLE_TONE[u.role]} />,
    },
    {
      key: "permissions",
      header: "Permissions",
      render: (u) => <span className="text-muted">{ROLE_PERMISSIONS[u.role]}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Users</h3>
          <p className="text-2xs text-muted">Demo directory — one seeded administrator.</p>
        </div>
        {DEMO_USERS.length === 0 ? (
          <EmptyState title="No users" description="Invite users once authentication is configured." />
        ) : (
          <DataTable rows={DEMO_USERS} columns={columns} exportName="users" pageSize={10} />
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Roles</h3>
          <p className="text-2xs text-muted">
            Four role tiers govern what each user can see and do.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(Object.keys(ROLE_PERMISSIONS) as DemoUser["role"][]).map((role) => (
            <div key={role} className="rounded-md border border-border p-3">
              <StatusBadge label={role} tone={ROLE_TONE[role]} />
              <p className="mt-2 text-2xs text-muted">{ROLE_PERMISSIONS[role]}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 inline-flex items-center gap-1.5 text-2xs text-muted">
          <Lock className="h-3.5 w-3.5" /> Authentication is a demo boundary — no credentials or
          secrets are hard-coded, and sign-in is stubbed for the pilot.
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 6. API usage & spending guardrails (cost controls)                     */
/* ---------------------------------------------------------------------- */

function UsageSection({
  perDomainBudgets,
  ledger,
  ledgerColumns,
  totalRequests,
  emergencyPaused,
  onToggleEmergency,
}: {
  perDomainBudgets: { domain: Domain; limit: number }[];
  ledger: UsageLedgerEntry[];
  ledgerColumns: Column<UsageLedgerEntry>[];
  totalRequests: number;
  emergencyPaused: boolean;
  onToggleEmergency: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Global guardrail */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Global monthly spending guardrail</h3>
            <p className="text-2xs text-muted">
              Hard cap across every provider and domain. Requests are refused once the cap is hit.
            </p>
          </div>
          <StatusBadge label="Demo — $0 spent" tone="success" />
        </div>
        <UsageMeter spent={0} limit={200} label="Global monthly budget" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Requests (30d)</div>
            <div className="text-lg font-semibold text-ink tnum">{fullNumber(totalRequests)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Spend (30d)</div>
            <div className="text-lg font-semibold text-ink tnum">{currency(0)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Remaining</div>
            <div className="text-lg font-semibold text-ink tnum">{currency(200)}</div>
          </div>
        </div>
      </Card>

      {/* Per-domain sub-budgets */}
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Per-domain sub-budgets</h3>
          <p className="text-2xs text-muted">
            Illustrative split of the $200 global cap across the portfolio. Each domain spent $0.
          </p>
        </div>
        <div className="space-y-3">
          {perDomainBudgets.map(({ domain, limit }) => (
            <div key={domain.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: domain.accent }} />
                <span className="text-sm font-medium text-ink">{domain.name}</span>
              </div>
              <UsageMeter spent={0} limit={limit} label={`${domain.host} budget`} />
            </div>
          ))}
        </div>
      </Card>

      {/* Budget thresholds */}
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Budget alert thresholds</h3>
          <p className="text-2xs text-muted">
            Alerts fire as cumulative spend crosses each threshold of the guardrail.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {BUDGET_THRESHOLDS.map((t) => (
            <div key={t} className="rounded-md border border-border p-3 text-center">
              <div
                className={cn(
                  "text-lg font-semibold tnum",
                  t >= 90 ? "text-critical" : t >= 75 ? "text-warning" : "text-ink",
                )}
              >
                {t}%
              </div>
              <div className="text-2xs text-muted">{currency((200 * t) / 100)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Request efficiency controls */}
      <Card>
        <CardHeader
          title="Request efficiency & safety controls"
          subtitle="Read-only demo — how cost is kept down under live operation"
        />
        <div className="divide-y divide-border">
          <ToggleRow
            title="Caching & deduplication"
            detail="Reuse recent provider responses; collapse duplicate in-flight requests."
            on
          />
          <ToggleRow
            title="Request batching"
            detail="Group keyword / SERP lookups into batched provider calls."
            on
          />
          <ToggleRow
            title="Retry limit + exponential backoff"
            detail="Max 3 retries with exponential backoff to avoid runaway request storms."
            on
          />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">Emergency pause — non-critical jobs</div>
              <div className="text-2xs text-muted">
                Immediately halt all non-critical provider jobs. Critical alerts still run.
              </div>
            </div>
            <button
              onClick={onToggleEmergency}
              role="switch"
              aria-checked={emergencyPaused}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <span
                className={cn(
                  "text-2xs font-medium",
                  emergencyPaused ? "text-critical" : "text-muted",
                )}
              >
                {emergencyPaused ? "Paused" : "Active"}
              </span>
              <span
                aria-hidden
                className={cn(
                  "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                  emergencyPaused ? "bg-critical" : "bg-workspace border border-border",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform",
                    emergencyPaused ? "translate-x-3.5" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </Card>

      {/* Request modes */}
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Request mode</h3>
          <p className="text-2xs text-muted">
            Default demo mode is Normal — cached-first and batched for lowest cost.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {REQUEST_MODES.map((m) => {
            const active = m.id === "normal";
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-md border p-3",
                  active ? "border-purple bg-purple/5" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{m.label}</span>
                  {active ? (
                    <Check className="h-4 w-4 text-purple" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted" />
                  )}
                </div>
                <p className="mt-1 text-2xs text-muted">{m.detail}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Usage ledger */}
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Usage ledger</h3>
          <p className="text-2xs text-muted">
            Per-day provider activity over the last 30 days. All spend is {currency(0)} in demo mode.
          </p>
        </div>
        {ledger.length === 0 ? (
          <EmptyState title="No usage recorded" description="Provider calls will appear here once connected." />
        ) : (
          <DataTable
            rows={ledger}
            columns={ledgerColumns}
            searchKeys={(r) => `${r.module} ${r.provider}`}
            exportName="usage-ledger"
            pageSize={12}
          />
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 7. Notifications & alerts                                              */
/* ---------------------------------------------------------------------- */

function NotificationsSection() {
  const alerts = SEED.alerts;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Notification rules</h3>
          <p className="text-2xs text-muted">Read-only demo toggles — which events raise an alert.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {NOTIFICATION_RULES.map((r) => (
            <div
              key={r.title}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">{r.title}</div>
                <div className="text-2xs text-muted">{r.detail}</div>
              </div>
              <ReadOnlySwitch on={r.on} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Recent alerts</h3>
          <p className="text-2xs text-muted">{alerts.length} alerts in the demo feed.</p>
        </div>
        {alerts.length === 0 ? (
          <EmptyState title="No alerts" description="You are all caught up." />
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md border border-border p-3",
                  !a.read && "bg-workspace/40",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    {!a.read && <span className="h-1.5 w-1.5 rounded-full bg-purple" aria-label="Unread" />}
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-ink">{a.title}</div>
                  <p className="text-2xs text-muted">{a.detail}</p>
                </div>
                <div className="shrink-0 whitespace-nowrap text-right">
                  <div className="text-2xs text-muted">{a.module}</div>
                  <div className="text-2xs text-muted">{relativeFromNow(a.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 8. Sync history & error logs / cache controls                          */
/* ---------------------------------------------------------------------- */

function SyncSection({
  cacheCleared,
  onClearCache,
}: {
  cacheCleared: boolean;
  onClearCache: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Sync history & error logs</h3>
          <p className="text-2xs text-muted">
            Provider sync runs and errors are logged here once connections are live.
          </p>
        </div>
        <EmptyState
          title="No sync runs yet"
          description="Demo mode — no provider has synced. Connect a provider under Data connections to begin populating this log."
          icon={<History className="h-6 w-6" />}
        />
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Cache controls</h3>
            <p className="text-2xs text-muted">
              Clearing the cache forces the next request to hit the provider directly.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClearCache} disabled={cacheCleared}>
            <Trash2 className="h-3.5 w-3.5" /> {cacheCleared ? "Cache cleared" : "Clear cache"}
          </Button>
        </div>
        {cacheCleared && (
          <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-2xs text-success">
            Local cache cleared. In demo mode this is a no-op — no cached provider data exists.
          </div>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Cache retention</div>
            <div className="text-sm font-medium text-ink">24 hours (default)</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Log retention</div>
            <div className="text-sm font-medium text-ink">90 days</div>
          </div>
        </div>
        <p className="mt-3 text-2xs text-muted">
          Retention windows are illustrative demo defaults and become configurable in production.
        </p>
      </Card>
    </div>
  );
}
