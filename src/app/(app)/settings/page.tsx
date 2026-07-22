"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Globe,
  PlugZap,
  CalendarClock,
  Users,
  Wallet,
  Lock,
  Bot,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  StatusBadge,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { UsageMeter } from "@/components/ui/usage-meter";
import { DOMAINS, getDomain } from "@/data/domains";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { useLivePortfolio } from "@/lib/use-live";
import { currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Domain, DomainId } from "@/lib/types";

/* ---------------------------------------------------------------------- */
/* API response shapes (from /api/health/* and /api/usage)                */
/* ---------------------------------------------------------------------- */

interface BudgetStatus {
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  pctUsed: number;
  crossed: number[];
}

interface UsageResponse {
  ok: boolean;
  note?: string;
  budget: BudgetStatus;
}

interface DataForSeoHealth {
  configured: boolean;
  spend?: BudgetStatus;
  models?: number;
  error?: string;
}

interface GoogleHealth {
  configured: boolean;
  gscReachable?: boolean;
  propertiesVisible?: number;
  gscSiteMap?: Record<string, string>;
  ga4PropertyMap?: Record<string, string | null>;
  error?: string;
}

/** Plain fetch state — loading / error / loaded, no fake fallbacks. */
type FetchState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: T };

function useProbe<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "done", data });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

/* ---------------------------------------------------------------------- */
/* Sub-navigation                                                         */
/* ---------------------------------------------------------------------- */

type SectionId = "domains" | "connections" | "sync" | "usage" | "users";

const SECTIONS: { id: SectionId; label: string; icon: typeof Globe; hint: string }[] = [
  { id: "domains", label: "Domains & properties", icon: Globe, hint: "Portfolio registry" },
  { id: "connections", label: "Data connections", icon: PlugZap, hint: "Live provider probes" },
  { id: "sync", label: "Sync & scheduling", icon: CalendarClock, hint: "Cadences & triggers" },
  { id: "usage", label: "Budget & usage", icon: Wallet, hint: "Real spend guardrail" },
  { id: "users", label: "Users & roles", icon: Users, hint: "Access model" },
];

/* ---------------------------------------------------------------------- */
/* Page                                                                   */
/* ---------------------------------------------------------------------- */

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("domains");
  const { data: pm, loading: pmLoading } = useLivePortfolio();

  // Latest sync across the portfolio, purely for the header badge.
  const lastSync = useMemo(() => {
    if (!pm) return null;
    return pm.domains.reduce<string | null>(
      (max, d) => (d.lastSync && (!max || d.lastSync > max) ? d.lastSync : max),
      null,
    );
  }, [pm]);

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Settings"
        description="Portfolio-level configuration: the domain registry, live provider connection health, sync cadences and the real spending guardrail."
        lastSync={lastSync}
        loading={pmLoading && !pm}
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
          {section === "connections" && <ConnectionsSection />}
          {section === "sync" && <SyncSection />}
          {section === "usage" && <UsageSection />}
          {section === "users" && <UsersSection />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 1. Domains & properties                                                */
/* ---------------------------------------------------------------------- */

function DomainsSection() {
  const columns = useMemo<Column<Domain>[]>(
    () => [
      {
        key: "name",
        header: "Domain",
        sortValue: (d) => d.name,
        render: (d) => (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.accent }} />
            <span className="font-medium text-ink">{d.name}</span>
          </div>
        ),
      },
      {
        key: "host",
        header: "Host",
        sortValue: (d) => d.host,
        render: (d) => <span className="text-muted">{d.host}</span>,
      },
      {
        key: "market",
        header: "Primary market",
        sortValue: (d) => d.primaryMarket,
        render: (d) => d.primaryMarket,
      },
      {
        key: "gscSite",
        header: "GSC property",
        sortValue: (d) => d.gscSite,
        render: (d) => <code className="text-xs text-muted">{d.gscSite}</code>,
      },
      {
        key: "ga4",
        header: "GA4 property",
        sortValue: (d) => d.ga4PropertyId ?? "",
        render: (d) =>
          d.ga4PropertyId ? (
            <code className="text-xs text-muted tnum">{d.ga4PropertyId}</code>
          ) : (
            <StatusBadge label="No GA4 property" tone="warning" />
          ),
      },
    ],
    [],
  );

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">Domains & properties</h3>
        <p className="text-2xs text-muted">
          {DOMAINS.length} domains in the portfolio. The registry (src/data/domains.ts) is the
          source of truth — every module, provider mapping and sync job derives from it.
        </p>
      </div>
      <DataTable
        rows={DOMAINS}
        columns={columns}
        searchKeys={(d) => `${d.name} ${d.host} ${d.primaryMarket}`}
        exportName="domains"
        pageSize={12}
      />
      <p className="mt-3 text-2xs text-muted">
        Domains without a GA4 property still sync Search Console and ranking data; sessions and
        conversions stay “—” until a property id is mapped in the registry.
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* 2. Data connections — live health probes, no fake states               */
/* ---------------------------------------------------------------------- */

function ConnectionCard({
  title,
  detail,
  badge,
  children,
}: {
  title: string;
  detail: string;
  badge: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {badge}
      </div>
      <p className="text-2xs text-muted">{detail}</p>
      {children && <div className="mt-3 border-t border-border pt-3 text-xs text-ink">{children}</div>}
    </Card>
  );
}

function ConnectionsSection() {
  const dfs = useProbe<DataForSeoHealth>("/api/health/dataforseo");
  const google = useProbe<GoogleHealth>("/api/health/google");

  const ga4Mapped = useMemo(() => {
    if (google.status !== "done" || !google.data.ga4PropertyMap) return null;
    return Object.values(google.data.ga4PropertyMap).filter((v) => v != null).length;
  }, [google]);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Data connections</h3>
          <p className="text-2xs text-muted">
            Each card reflects a live health probe run just now against the real provider — nothing
            here is simulated. Credentials live server-side only.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* DataForSEO */}
          {dfs.status === "loading" ? (
            <Skeleton className="h-36" />
          ) : dfs.status === "error" ? (
            <ConnectionCard
              title="DataForSEO"
              detail="Rankings, keywords, backlinks, on-page crawls and AI visibility checks."
              badge={<StatusBadge label="Probe failed" tone="critical" />}
            >
              <span className="text-critical">{dfs.message}</span>
            </ConnectionCard>
          ) : !dfs.data.configured ? (
            <ConnectionCard
              title="DataForSEO"
              detail="Rankings, keywords, backlinks, on-page crawls and AI visibility checks."
              badge={<StatusBadge label="Not configured" tone="neutral" />}
            >
              <span className="text-muted">
                Set DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD in the environment to connect.
              </span>
            </ConnectionCard>
          ) : dfs.data.error ? (
            <ConnectionCard
              title="DataForSEO"
              detail="Rankings, keywords, backlinks, on-page crawls and AI visibility checks."
              badge={<StatusBadge label="Error" tone="critical" />}
            >
              <span className="text-critical">{dfs.data.error}</span>
            </ConnectionCard>
          ) : (
            <ConnectionCard
              title="DataForSEO"
              detail="Rankings, keywords, backlinks, on-page crawls and AI visibility checks."
              badge={<StatusBadge label="Connected" tone="success" />}
            >
              {dfs.data.models != null && (
                <div className="tnum">{dfs.data.models} LLM models visible (zero-cost probe)</div>
              )}
              {dfs.data.spend && (
                <div className="mt-1 text-2xs text-muted tnum">
                  Month-to-date spend {currency(dfs.data.spend.spentUsd)} of{" "}
                  {currency(dfs.data.spend.limitUsd)}
                </div>
              )}
            </ConnectionCard>
          )}

          {/* Google Search Console */}
          {google.status === "loading" ? (
            <Skeleton className="h-36" />
          ) : google.status === "error" ? (
            <ConnectionCard
              title="Google Search Console"
              detail="Clicks, impressions, queries, pages and movers per domain — free API."
              badge={<StatusBadge label="Probe failed" tone="critical" />}
            >
              <span className="text-critical">{google.message}</span>
            </ConnectionCard>
          ) : !google.data.configured ? (
            <ConnectionCard
              title="Google Search Console"
              detail="Clicks, impressions, queries, pages and movers per domain — free API."
              badge={<StatusBadge label="Not configured" tone="neutral" />}
            >
              <span className="text-muted">
                Set the Google service-account credentials in the environment to connect.
              </span>
            </ConnectionCard>
          ) : google.data.error ? (
            <ConnectionCard
              title="Google Search Console"
              detail="Clicks, impressions, queries, pages and movers per domain — free API."
              badge={<StatusBadge label="Error" tone="critical" />}
            >
              <span className="text-critical">{google.data.error}</span>
            </ConnectionCard>
          ) : (
            <ConnectionCard
              title="Google Search Console"
              detail="Clicks, impressions, queries, pages and movers per domain — free API."
              badge={
                google.data.gscReachable ? (
                  <StatusBadge label="Connected" tone="success" />
                ) : (
                  <StatusBadge label="Unreachable" tone="critical" />
                )
              }
            >
              {google.data.gscReachable ? (
                <div className="tnum">
                  {google.data.propertiesVisible ?? 0} properties visible to the service account
                </div>
              ) : (
                <span className="text-muted">
                  Credentials are configured but the property listing call did not succeed.
                </span>
              )}
            </ConnectionCard>
          )}

          {/* GA4 */}
          {google.status === "loading" ? (
            <Skeleton className="h-36" />
          ) : google.status === "error" ? (
            <ConnectionCard
              title="Google Analytics 4"
              detail="Organic sessions, engagement and conversions for mapped properties — free API."
              badge={<StatusBadge label="Probe failed" tone="critical" />}
            >
              <span className="text-critical">{google.message}</span>
            </ConnectionCard>
          ) : !google.data.configured ? (
            <ConnectionCard
              title="Google Analytics 4"
              detail="Organic sessions, engagement and conversions for mapped properties — free API."
              badge={<StatusBadge label="Not configured" tone="neutral" />}
            >
              <span className="text-muted">
                GA4 uses the same Google credentials as Search Console.
              </span>
            </ConnectionCard>
          ) : google.data.error ? (
            <ConnectionCard
              title="Google Analytics 4"
              detail="Organic sessions, engagement and conversions for mapped properties — free API."
              badge={<StatusBadge label="Error" tone="critical" />}
            >
              <span className="text-critical">{google.data.error}</span>
            </ConnectionCard>
          ) : (
            <ConnectionCard
              title="Google Analytics 4"
              detail="Organic sessions, engagement and conversions for mapped properties — free API."
              badge={
                ga4Mapped != null && ga4Mapped > 0 ? (
                  <StatusBadge label="Mapped" tone="success" />
                ) : (
                  <StatusBadge label="No properties mapped" tone="warning" />
                )
              }
            >
              {ga4Mapped != null ? (
                <div className="tnum">
                  {ga4Mapped} of {DOMAINS.length} domains have a GA4 property mapped
                </div>
              ) : (
                <span className="text-muted">The probe returned no GA4 property map.</span>
              )}
            </ConnectionCard>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 3. Sync & scheduling — read-only description of the real cadences      */
/* ---------------------------------------------------------------------- */

function SyncSection() {
  const trackedDomainIds = Object.keys(TRACKED_AI_PROMPTS) as DomainId[];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-purple" />
              <h3 className="text-sm font-semibold text-ink">Daily full sync</h3>
            </div>
            <StatusBadge label="06:00 UTC" tone="info" />
          </div>
          <p className="mt-2 text-2xs text-muted">
            A Render cron job runs the full pipeline daily: Search Console totals, timeseries,
            queries, pages and movers; GA4 overview and landing pages for mapped domains; DataForSEO
            rankings, keywords, backlinks and competitors. Each run appends one visibility point per
            domain.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-purple" />
              <h3 className="text-sm font-semibold text-ink">OnPage crawls</h3>
            </div>
            <StatusBadge label="Weekly · Sundays" tone="info" />
          </div>
          <p className="mt-2 text-2xs text-muted">
            Technical crawls run once on a domain&apos;s first sync, then refresh weekly on Sundays.
            Health score, issue counts and category breakdowns come from the latest completed
            crawl.
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple" />
          <h3 className="text-sm font-semibold text-ink">AI prompt checks</h3>
        </div>
        <p className="text-2xs text-muted">
          Only domains listed in the tracking config (src/data/ai-prompts.ts) run paid LLM checks
          during sync, keeping AI spend deliberate. Currently tracked:
        </p>
        {trackedDomainIds.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No domains tracked"
              description="Add domains and prompts to TRACKED_AI_PROMPTS to start AI visibility checks."
            />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {trackedDomainIds.map((id) => {
              const domain = getDomain(id);
              const prompts = TRACKED_AI_PROMPTS[id] ?? [];
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: domain.accent }}
                    />
                    <span className="text-xs font-medium text-ink">{domain.name}</span>
                    <span className="text-2xs text-muted">{domain.host}</span>
                  </div>
                  <span className="text-2xs text-muted tnum">{prompts.length} prompts</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-purple" />
          <h3 className="text-sm font-semibold text-ink">Manual trigger</h3>
        </div>
        <p className="text-2xs text-muted">
          A sync can be triggered outside the schedule via the protected endpoint{" "}
          <code className="rounded bg-workspace px-1 py-0.5 text-[10px] text-ink">
            POST /api/sync
          </code>{" "}
          (requires the SYNC_TOKEN secret), or from the Render cron job&apos;s “Trigger Run” button. No
          in-app trigger exists yet — the token never reaches the browser.
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 4. Budget & usage — real spend from /api/usage                         */
/* ---------------------------------------------------------------------- */

const BUDGET_THRESHOLDS = [50, 75, 90, 100] as const;

function UsageSection() {
  const usage = useProbe<UsageResponse>("/api/usage");

  if (usage.status === "loading") {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  if (usage.status === "error") {
    return <EmptyState title="Could not load usage data" description={usage.message} />;
  }

  const { budget } = usage.data;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Monthly spending guardrail</h3>
            <p className="text-2xs text-muted">
              Month-to-date DataForSEO spend against the app-owned cap. Requests are refused once
              the cap is hit.
            </p>
          </div>
          {!usage.data.ok && usage.data.note && (
            <StatusBadge label={usage.data.note} tone="warning" />
          )}
        </div>
        <UsageMeter spent={budget.spentUsd} limit={budget.limitUsd} label="Global monthly budget" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Spent (month to date)</div>
            <div className="text-lg font-semibold text-ink tnum">{currency(budget.spentUsd)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Remaining</div>
            <div className="text-lg font-semibold text-ink tnum">{currency(budget.remainingUsd)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-2xs text-muted">Budget used</div>
            <div className="text-lg font-semibold text-ink tnum">{budget.pctUsed.toFixed(1)}%</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Alert thresholds</h3>
          <p className="text-2xs text-muted">
            Thresholds highlight as cumulative spend crosses each share of the cap.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {BUDGET_THRESHOLDS.map((t) => {
            const crossed = budget.crossed.includes(t);
            return (
              <div
                key={t}
                className={cn(
                  "rounded-md border p-3 text-center",
                  crossed
                    ? t >= 90
                      ? "border-critical/40 bg-critical/10"
                      : "border-warning/40 bg-warning/10"
                    : "border-border",
                )}
              >
                <div
                  className={cn(
                    "text-lg font-semibold tnum",
                    crossed ? (t >= 90 ? "text-critical" : "text-[#B9791A]") : "text-ink",
                  )}
                >
                  {t}%
                </div>
                <div className="text-2xs text-muted tnum">{currency((budget.limitUsd * t) / 100)}</div>
                <div className="mt-1 text-2xs font-medium">
                  {crossed ? (
                    <span className={t >= 90 ? "text-critical" : "text-[#B9791A]"}>Crossed</span>
                  ) : (
                    <span className="text-muted">Not crossed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-ink">How spend is recorded</h3>
        <p className="mt-2 text-2xs text-muted">
          DataForSEO is the only paid provider — Google Search Console and GA4 APIs are free. Spend
          is recorded per real API call using the actual cost the provider returns, so the meter
          above reflects genuine month-to-date usage, not estimates.
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 5. Users & roles — access-model description (auth is a next milestone) */
/* ---------------------------------------------------------------------- */

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "seo_analyst" | "viewer";
}

const USERS: AppUser[] = [{ id: "u-1", name: "Orwell Admin", email: "admin@orwell.io", role: "admin" }];

const ROLE_PERMISSIONS: Record<AppUser["role"], string> = {
  admin: "Settings, providers, domains, users and all data across the portfolio.",
  manager: "All domains, reports, approvals and tasks. No provider/user administration.",
  seo_analyst: "Research, analysis, recommendations and tasks for assigned domains.",
  viewer: "Read-only access to dashboards and reports.",
};

const ROLE_TONE: Record<AppUser["role"], "info" | "success" | "warning" | "neutral"> = {
  admin: "info",
  manager: "success",
  seo_analyst: "warning",
  viewer: "neutral",
};

function UsersSection() {
  const columns = useMemo<Column<AppUser>[]>(
    () => [
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
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Users</h3>
          <p className="text-2xs text-muted">
            The pilot runs with a single administrator. This is a description of the intended
            access model, not live account data.
          </p>
        </div>
        <DataTable rows={USERS} columns={columns} exportName="users" pageSize={10} />
      </Card>

      <Card className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-ink">Roles</h3>
          <p className="text-2xs text-muted">Four role tiers govern what each user can see and do.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(Object.keys(ROLE_PERMISSIONS) as AppUser["role"][]).map((role) => (
            <div key={role} className="rounded-md border border-border p-3">
              <StatusBadge label={role} tone={ROLE_TONE[role]} />
              <p className="mt-2 text-2xs text-muted">{ROLE_PERMISSIONS[role]}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 inline-flex items-center gap-1.5 text-2xs text-muted">
          <Lock className="h-3.5 w-3.5" /> Auth integration is a next milestone — sign-in is not
          yet wired, and no credentials are stored in the app.
        </p>
      </Card>
    </div>
  );
}
