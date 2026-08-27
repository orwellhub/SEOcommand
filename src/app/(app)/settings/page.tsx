"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Plus,
  MessageCircleMore,
  Send,
  UserPlus,
  Copy,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardHeader,
  StatusBadge,
  EmptyState,
  Skeleton,
  Button,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { UsageMeter } from "@/components/ui/usage-meter";
import { DOMAINS, getDomain } from "@/data/domains";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { useLivePortfolio } from "@/lib/use-live";
import { currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Domain, DomainId } from "@/lib/types";
import { useDomain } from "@/components/shell/domain-context";

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
  locations?: Record<string, { locationCode?: number; languageCode?: string; error?: string }>;
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

interface SessionResponse {
  user: { email: string | null; name: string | null; role: AppUser["role"] | null };
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

type SectionId = "domains" | "connections" | "sync" | "usage" | "messaging" | "users";

const SECTIONS: { id: SectionId; label: string; icon: typeof Globe; hint: string }[] = [
  { id: "domains", label: "Domains & properties", icon: Globe, hint: "Portfolio registry" },
  { id: "connections", label: "Data connections", icon: PlugZap, hint: "Live provider probes" },
  { id: "sync", label: "Sync & scheduling", icon: CalendarClock, hint: "Cadences & triggers" },
  { id: "usage", label: "Budget & usage", icon: Wallet, hint: "Real spend guardrail" },
  { id: "messaging", label: "WhatsApp delivery", icon: MessageCircleMore, hint: "Setup & test" },
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
          {section === "messaging" && <WhatsAppSection />}
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
  const { sites } = useDomain();
  const router = useRouter();
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
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
        <h3 className="text-sm font-semibold text-ink">Domains & properties</h3>
        <p className="text-2xs text-muted">
          {sites.length} websites in the runtime portfolio. New websites are stored in Postgres;
          the original source registry remains as a compatibility fallback.
        </p>
        </div>
        <Link href="/sites/new" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-purple px-3 text-xs font-medium text-white hover:bg-purple-deep"><Plus className="h-3.5 w-3.5" /> Add website</Link>
      </div>
      <DataTable
        rows={sites}
        columns={columns}
        searchKeys={(d) => `${d.name} ${d.host} ${d.primaryMarket}`}
        exportName="domains"
        pageSize={12}
        rowKey={(domain) => domain.id}
        onRowClick={(domain) => router.push(`/sites/${domain.id}/settings`)}
      />
      <p className="mt-3 text-2xs text-muted">
        Select any website to manage its connectors, spending limits, prompt checks, schedules and access.
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
  const missingDfsMarkets =
    dfs.status === "done"
      ? Object.entries(dfs.data.locations ?? {}).filter(([, location]) => location.error)
      : [];

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
              badge={
                missingDfsMarkets.length > 0 ? (
                  <StatusBadge label="Markets required" tone="warning" />
                ) : (
                  <StatusBadge label="Connected" tone="success" />
                )
              }
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
              {missingDfsMarkets.length > 0 && (
                <div className="mt-2 text-2xs text-[#B9791A]">
                  {missingDfsMarkets.map(([domainId]) => getDomain(domainId).name).join(", ")} need
                  an explicit DataForSEO priority market before ranking syncs will run.
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
              <h3 className="text-sm font-semibold text-ink">Split-cadence sync</h3>
            </div>
            <StatusBadge label="06:00 UTC" tone="info" />
          </div>
          <p className="mt-2 text-2xs text-muted">
            A Render cron runs Google Search Console and GA4 daily. Paid DataForSEO rankings,
            keywords, backlinks and competitors refresh on Mondays; the daily job also resumes any
            pending crawl without starting another paid task.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-purple" />
              <h3 className="text-sm font-semibold text-ink">OnPage crawls</h3>
            </div>
            <StatusBadge label="Monthly · 1st" tone="info" />
          </div>
          <p className="mt-2 text-2xs text-muted">
            Paid technical crawls start on the first of each month. Pending crawls are polled on
            later daily runs until complete; health and issue breakdowns retain the latest result.
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
/* 5. WhatsApp delivery — guided Meta Cloud API setup and test            */
/* ---------------------------------------------------------------------- */

interface WhatsAppPayload {
  integration: { provider?: "meta_cloud" | "webhook"; status?: string; displayName?: string | null; phoneNumber?: string | null; accountId?: string | null; senderId?: string | null; lastTestAt?: string | null; lastTestStatus?: string | null; lastError?: string | null } | null;
  environment: { tokenConfigured: boolean; senderConfigured: boolean; webhookConfigured: boolean; verifyTokenConfigured: boolean };
  setup?: { callbackPath: string; requiredSecrets: string[]; fallbackSecret: string };
}

function WhatsAppSection() {
  const [payload, setPayload] = useState<WhatsAppPayload | null>(null);
  const [draft, setDraft] = useState({ provider: "meta_cloud" as "meta_cloud" | "webhook", displayName: "Orwell SEO alerts", phoneNumber: "", accountId: "", senderId: "" });
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = async () => {
    const response = await fetch("/api/integrations/whatsapp", { cache: "no-store" }); const body = await response.json();
    if (!response.ok) { setNotice(body.error ?? "Could not load WhatsApp settings."); return; }
    setPayload(body); const integration = body.integration ?? {}; setDraft({ provider: integration.provider ?? "meta_cloud", displayName: integration.displayName ?? "Orwell SEO alerts", phoneNumber: integration.phoneNumber ?? "", accountId: integration.accountId ?? "", senderId: integration.senderId ?? "" });
  };
  useEffect(() => { void load(); }, []);
  async function save() { setBusy(true); setNotice(null); const response = await fetch("/api/integrations/whatsapp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); const body = await response.json(); setBusy(false); setNotice(response.ok ? "WhatsApp delivery settings saved." : body.error ?? "Could not save settings."); if (response.ok) await load(); }
  async function test() { if (!recipient.trim()) return; setBusy(true); setNotice(null); const response = await fetch("/api/integrations/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient }) }); const body = await response.json(); setBusy(false); setNotice(response.ok ? "Test message delivered successfully." : body.error ?? "Test delivery failed."); if (response.ok) await load(); }
  const callbackUrl = typeof window === "undefined" ? "/api/webhooks/whatsapp" : `${window.location.origin}/api/webhooks/whatsapp`;
  return <div className="space-y-5">
    <Card className="overflow-hidden"><div className="h-1 bg-gradient-to-r from-[#16A879] via-[#12B8C4] to-[#335CFF]" /><div className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-extrabold text-ink">WhatsApp delivery</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Connect Meta’s WhatsApp Cloud API for alerts and report links. A generic delivery webhook remains available as a fallback.</p></div><StatusBadge label={payload?.integration?.status ?? "not configured"} tone={payload?.integration?.status === "connected" ? "success" : "warning"} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["1","Create Meta app",true],["2","Add server secrets",Boolean(payload?.environment.tokenConfigured && payload?.environment.senderConfigured)],["3","Verify webhook",Boolean(payload?.environment.verifyTokenConfigured)],["4","Send a test",payload?.integration?.lastTestStatus === "passed"]].map(([number,label,done]) => <div key={String(number)} className={cn("rounded-lg border p-3", done ? "border-success/25 bg-success/5" : "border-border bg-workspace/50")}><div className="flex items-center gap-2"><span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", done ? "bg-success text-white" : "bg-card text-muted")}>{number}</span><span className="text-xs font-bold text-ink">{label}</span></div></div>)}</div>
    </div></Card>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"><Card className="p-5"><h3 className="text-sm font-bold text-ink">Connection details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><SettingsField label="Delivery method"><select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value as "meta_cloud" | "webhook" })} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink"><option value="meta_cloud">Meta Cloud API · recommended</option><option value="webhook">Generic webhook fallback</option></select></SettingsField><SettingsField label="Display name"><SettingsInput value={draft.displayName} onChange={(value) => setDraft({ ...draft, displayName: value })} /></SettingsField><SettingsField label="WhatsApp phone number"><SettingsInput value={draft.phoneNumber} onChange={(value) => setDraft({ ...draft, phoneNumber: value })} placeholder="+971…" /></SettingsField><SettingsField label="Phone number ID"><SettingsInput value={draft.senderId} onChange={(value) => setDraft({ ...draft, senderId: value })} placeholder="Meta phone number ID" /></SettingsField><SettingsField label="Business account ID"><SettingsInput value={draft.accountId} onChange={(value) => setDraft({ ...draft, accountId: value })} /></SettingsField><SettingsField label="Callback URL"><div className="flex gap-2"><input readOnly value={callbackUrl} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-workspace px-3 text-xs text-muted" /><button onClick={() => void navigator.clipboard.writeText(callbackUrl)} className="rounded-md border border-border px-3 text-muted hover:bg-workspace" aria-label="Copy callback URL"><Copy className="h-4 w-4" /></button></div></SettingsField></div><div className="mt-4 rounded-md border border-border bg-workspace/60 p-3 text-xs leading-5 text-muted">Secrets are never stored in the browser or database. Add <code className="text-ink">META_WHATSAPP_TOKEN</code>, <code className="text-ink">META_WHATSAPP_PHONE_NUMBER_ID</code> and <code className="text-ink">WHATSAPP_VERIFY_TOKEN</code> to Render. Website-level recipients and alert types remain in each website’s settings.</div><Button variant="primary" className="mt-4" disabled={busy} onClick={() => void save()}>{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save connection</Button></Card>
      <Card className="h-fit p-5"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-[#16A879]" /><h3 className="text-sm font-bold text-ink">Test delivery</h3></div><p className="mt-2 text-xs leading-5 text-muted">Send one connection test before enabling operational alerts.</p><SettingsField label="Recipient with country code"><SettingsInput value={recipient} onChange={setRecipient} placeholder="+971501234567" /></SettingsField><Button className="mt-3 w-full" variant="primary" disabled={!recipient.trim() || busy} onClick={() => void test()}><Send className="h-4 w-4" /> Send test message</Button>{payload?.integration?.lastTestAt && <p className="mt-3 text-2xs text-muted">Last test: {new Date(payload.integration.lastTestAt).toLocaleString()} · {payload.integration.lastTestStatus}</p>}{payload?.integration?.lastError && <p className="mt-2 text-2xs text-critical">{payload.integration.lastError}</p>}</Card></div>
    {notice && <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-ink">{notice}</div>}
  </div>;
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-2xs font-bold uppercase tracking-wide text-muted">{label}</span>{children}</label>; }
function SettingsInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />; }

/* ---------------------------------------------------------------------- */
/* 6. Users & roles — database accounts, invitations and scoped grants    */
/* ---------------------------------------------------------------------- */

type UserRole = "admin" | "manager" | "seo_analyst" | "viewer";
interface UserGrant { scopeType: "portfolio" | "group" | "site"; scopeId?: string | null; permissions: string[]; }
interface AppUser {
  id: string; name: string; email: string; role: UserRole; status: string; grants: UserGrant[]; source?: string; invitedAt?: string | null; lastSignedInAt?: string | null;
}

const ROLE_PERMISSIONS: Record<AppUser["role"], string> = {
  admin: "Settings, providers, domains, users and all data across the portfolio.",
  manager: "All domains, reports, approvals, connectors and user administration. No content changes.",
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
  const { sites, groups } = useDomain();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<UserRole>("viewer");
  const [scopeType, setScopeType] = useState<UserGrant["scopeType"]>("portfolio"); const [scopeId, setScopeId] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["view"]); const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [inviteUrl, setInviteUrl] = useState<string | null>(null); const [editing, setEditing] = useState<AppUser | null>(null);
  const load = async () => { setLoading(true); const response = await fetch("/api/users", { cache: "no-store" }); const body = await response.json(); setLoading(false); if (!response.ok) { setNotice(body.error ?? "Could not load users."); return; } setUsers(body.users ?? []); setAvailablePermissions(body.permissions ?? []); };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const defaults: Record<UserRole,string[]> = { admin: ["view","research","run_scans","manage_content","manage_connectors","approve_spend","manage_users","manage_reports"], manager: ["view","research","run_scans","manage_connectors","approve_spend","manage_users","manage_reports"], seo_analyst: ["view","research","run_scans","manage_content"], viewer: ["view"] }; setPermissions(defaults[role]); }, [role]);
  async function invite() { setBusy(true); setNotice(null); setInviteUrl(null); const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, role, grants: [{ scopeType, scopeId: scopeType === "portfolio" ? null : scopeId, permissions }] }) }); const body = await response.json(); setBusy(false); if (!response.ok) { setNotice(body.error ?? "Could not send the invitation."); return; } setNotice(body.delivery?.delivered ? "Invitation email sent." : body.delivery?.reason ?? "Invitation created."); setInviteUrl(body.inviteUrl ?? null); setName(""); setEmail(""); await load(); }
  async function saveUser() { if (!editing || editing.source === "bootstrap") return; setBusy(true); const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, role: editing.role, status: editing.status, grants: editing.grants }) }); const body = await response.json(); setBusy(false); if (!response.ok) { setNotice(body.error ?? "Could not update the user."); return; } setNotice("User role and permissions updated. Changes apply on their next sign-in."); setEditing(null); await load(); }
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
        key: "status",
        header: "Status",
        sortValue: (u) => u.status,
        render: (u) => <StatusBadge label={u.status} tone={u.status === "active" ? "success" : u.status === "invited" ? "info" : "warning"} />,
      },
      {
        key: "permissions",
        header: "Access scope",
        render: (u) => <div className="flex flex-wrap gap-1">{u.source === "bootstrap" ? <span className="text-xs text-muted">Bootstrap portfolio account</span> : u.grants.map((grant,index) => <span key={`${grant.scopeType}:${grant.scopeId}:${index}`} className="rounded-full bg-workspace px-2 py-1 text-[10px] font-semibold text-muted">{grant.scopeType}{grant.scopeId ? ` · ${groups.find((group) => group.id === grant.scopeId)?.name ?? sites.find((site) => site.id === grant.scopeId)?.name ?? grant.scopeId}` : ""}</span>)}</div>,
      },
    ],
    [groups, sites],
  );

  return (
    <div className="space-y-5">
      <Card className="p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">Workspace users</h3><p className="mt-0.5 text-2xs text-muted">Invite users, assign one of four roles and scope access to the portfolio, a folder or an individual website.</p></div><StatusBadge label={`${users.length} users`} tone="info" /></div>
        {loading ? (
          <Skeleton className="h-20" />
        ) : (
          <DataTable rows={users} columns={columns} exportName="users" pageSize={10} rowKey={(user) => user.id} onRowClick={(user) => setEditing(structuredClone(user))} />
        )}
      </Card>
      <Card className="p-5"><div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-purple" /><h3 className="text-sm font-bold text-ink">Invite a user</h3></div><div className="mt-4 grid gap-4 md:grid-cols-2"><SettingsField label="Name"><SettingsInput value={name} onChange={setName} /></SettingsField><SettingsField label="Email"><SettingsInput value={email} onChange={setEmail} placeholder="name@example.com" /></SettingsField><SettingsField label="Role"><select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink">{(Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((item) => <option key={item} value={item}>{item.replace("seo_analyst","SEO operator")}</option>)}</select><span className="mt-1 block text-[10px] text-muted">{ROLE_PERMISSIONS[role]}</span></SettingsField><SettingsField label="Access scope"><div className="grid grid-cols-[130px_1fr] gap-2"><select value={scopeType} onChange={(event) => { setScopeType(event.target.value as UserGrant["scopeType"]); setScopeId(""); }} className="h-10 rounded-md border border-border bg-card px-2 text-sm text-ink"><option value="portfolio">Portfolio</option><option value="group">Folder</option><option value="site">Website</option></select>{scopeType === "portfolio" ? <div className="flex h-10 items-center rounded-md border border-border bg-workspace px-3 text-xs text-muted">All websites</div> : <select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className="h-10 min-w-0 rounded-md border border-border bg-card px-2 text-sm text-ink"><option value="">Choose…</option>{(scopeType === "group" ? groups : sites).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div></SettingsField></div><div className="mt-4"><div className="text-2xs font-bold uppercase tracking-wide text-muted">Permissions</div><div className="mt-2 flex flex-wrap gap-2">{availablePermissions.map((permission) => <label key={permission} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold", permissions.includes(permission) ? "border-purple/30 bg-purple/10 text-purple" : "border-border text-muted")}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission])} className="accent-purple" />{permission.replace(/_/g," ")}</label>)}</div></div><Button variant="primary" className="mt-4" disabled={busy || !name.trim() || !email.includes("@") || !permissions.length || (scopeType !== "portfolio" && !scopeId)} onClick={() => void invite()}>{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Send email invitation</Button>{notice && <p className="mt-3 text-xs text-muted">{notice}</p>}{inviteUrl && <div className="mt-3 flex gap-2 rounded-md border border-warning/25 bg-warning/10 p-2"><input readOnly value={inviteUrl} className="min-w-0 flex-1 bg-transparent px-2 text-xs text-ink" /><button onClick={() => void navigator.clipboard.writeText(inviteUrl)} className="rounded p-2 text-muted hover:bg-card"><Copy className="h-4 w-4" /></button></div>}</Card>
      {editing && <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-ink">Edit {editing.name}</h3><p className="mt-0.5 text-xs text-muted">{editing.email}</p></div><button onClick={() => setEditing(null)} className="rounded p-2 text-muted hover:bg-workspace"><X className="h-4 w-4" /></button></div>{editing.source === "bootstrap" ? <div className="mt-4 rounded-md border border-warning/20 bg-warning/10 p-3 text-xs text-muted">The bootstrap account remains managed through Render secrets. Invite a database-backed account for configurable permissions.</div> : <><div className="mt-4 grid gap-4 sm:grid-cols-2"><SettingsField label="Role"><select value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as UserRole })} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink">{(Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((item) => <option key={item} value={item}>{item}</option>)}</select></SettingsField><SettingsField label="Account status"><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink"><option value="active">Active</option><option value="suspended">Suspended</option></select></SettingsField></div><div className="mt-4 space-y-3">{editing.grants.map((grant,index) => <div key={index} className="rounded-md border border-border p-3"><div className="text-xs font-bold capitalize text-ink">{grant.scopeType} {grant.scopeId ? `· ${groups.find((item) => item.id === grant.scopeId)?.name ?? sites.find((item) => item.id === grant.scopeId)?.name ?? grant.scopeId}` : ""}</div><div className="mt-2 flex flex-wrap gap-2">{availablePermissions.map((permission) => <label key={permission} className="flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" checked={grant.permissions.includes(permission)} onChange={() => setEditing({ ...editing, grants: editing.grants.map((item,grantIndex) => grantIndex === index ? { ...item, permissions: item.permissions.includes(permission) ? item.permissions.filter((value) => value !== permission) : [...item.permissions, permission] } : item) })} className="accent-purple" />{permission.replace(/_/g," ")}</label>)}</div></div>)}</div><Button variant="primary" className="mt-4" disabled={busy} onClick={() => void saveUser()}><ShieldCheck className="h-4 w-4" /> Save role & permissions</Button></>}</Card>}
      <p className="inline-flex items-center gap-1.5 text-2xs text-muted"><Lock className="h-3.5 w-3.5" /> Signed HTTP-only sessions protect every dashboard and live-data API. Scoped grants are enforced server-side.</p>
    </div>
  );
}
