"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Plus, ServerCog, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { ManagedSite } from "@/platform/types";
import type { PortfolioGroup } from "@/platform/types";
import { GroupManager } from "@/components/portfolio/group-manager";

interface Connection {
  id: string;
  siteSlug: string;
  kind: string;
  status: string;
  displayName: string;
  remoteUrl: string | null;
}

function tone(status: string): "success" | "warning" | "critical" | "neutral" | "info" {
  if (status === "active" || status === "approved" || status === "connected") return "success";
  if (status === "error" || status === "rejected") return "critical";
  if (status === "provisioning" || status === "forecast_pending" || status === "pending") return "warning";
  return "neutral";
}

export default function SitesPage() {
  const [sites, setSites] = useState<ManagedSite[] | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [syntheticOnboardingComplete, setSyntheticOnboardingComplete] = useState(false);

  useEffect(() => {
    setSyntheticOnboardingComplete(new URLSearchParams(window.location.search).get("onboarded") === "synthetic");
  }, []);

  useEffect(() => {
    fetch("/api/sites")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json() as Promise<{ sites: ManagedSite[]; connections: Connection[]; groups: PortfolioGroup[] }>;
      })
      .then((body) => {
        setSites(body.sites);
        setConnections(body.connections);
        setGroups(body.groups ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [reload]);

  const columns = useMemo<Column<ManagedSite>[]>(
    () => [
      {
        key: "groups",
        header: "Groups",
        render: (site) => {
          const assigned = groups.filter((group) => group.siteSlugs.includes(site.id));
          return assigned.length ? <div className="flex max-w-56 flex-wrap gap-1">{assigned.map((group) => <span key={group.id} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-2xs" style={{ color: group.color }}>{group.name}</span>)}</div> : <span className="text-muted">Ungrouped</span>;
        },
      },
      {
        key: "site",
        header: "Website",
        sortValue: (site) => site.name,
        render: (site) => (
          <div className="flex items-center gap-2.5">
            <Circle className="h-2.5 w-2.5" style={{ fill: site.accent, color: site.accent }} />
            <div>
              <Link href={`/sites/${site.id}`} className="font-medium text-ink hover:underline">
                {site.name}
              </Link>
              <div className="text-2xs text-muted">{site.host}</div>
            </div>
          </div>
        ),
      },
      {
        key: "settings",
        header: "",
        align: "right",
        render: (site) => <Link href={`/sites/${site.id}/settings`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-workspace hover:text-ink"><Settings2 className="h-3.5 w-3.5" /> Settings</Link>,
      },
      {
        key: "status",
        header: "Lifecycle",
        sortValue: (site) => site.lifecycleStatus,
        render: (site) => <StatusBadge label={site.lifecycleStatus} tone={tone(site.lifecycleStatus)} />,
      },
      {
        key: "spend",
        header: "Spend approval",
        sortValue: (site) => site.spendApproval,
        render: (site) => <StatusBadge label={site.spendApproval} tone={tone(site.spendApproval)} />,
      },
      {
        key: "forecast",
        header: "Monthly forecast",
        align: "right",
        sortValue: (site) => site.forecastMonthlyUsd,
        render: (site) => site.forecastMonthlyUsd ? `$${site.forecastMonthlyUsd.toFixed(2)}` : "Legacy plan",
      },
      {
        key: "market",
        header: "Market / devices",
        sortValue: (site) => site.primaryMarket,
        render: (site) => (
          <div>
            <div>{site.primaryMarket}</div>
            <div className="text-2xs capitalize text-muted">{site.devices.join(" + ")}</div>
          </div>
        ),
      },
      {
        key: "connections",
        header: "Connections",
        render: (site) => {
          const linked = connections.filter((connection) => connection.siteSlug === site.id);
          return linked.length ? (
            <div className="flex flex-wrap gap-1">
              {linked.map((connection) => (
                <StatusBadge key={connection.id} label={connection.kind} tone={tone(connection.status)} />
              ))}
            </div>
          ) : (
            <span className="text-muted">None</span>
          );
        },
      },
    ],
    [connections, groups],
  );

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Website operations"
        description="Onboard, approve and connect the websites in the portfolio. Designed to remain usable beyond 300 sites."
        actions={<div className="flex flex-wrap gap-2"><GroupManager sites={sites ?? []} groups={groups} onChanged={() => setReload((value) => value + 1)} /><Link href="/sites/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-purple px-3.5 text-sm font-medium text-white hover:bg-purple-deep"><Plus className="h-4 w-4" /> Add website</Link></div>}
      />

      {syntheticOnboardingComplete && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-success/25 bg-success/5 px-4 py-3 text-xs text-ink">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div><strong>Synthetic onboarding completed.</strong> The free-monitoring handoff and paid-spend gate passed; the fixed 20-site staging dataset remains unchanged.</div>
        </div>
      )}

      {error ? (
        <EmptyState title="Could not load websites" description={error} icon={<ServerCog className="h-6 w-6" />} />
      ) : !sites ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Portfolio registry</h2>
              <p className="mt-0.5 text-2xs text-muted">{sites.length} websites · paid work runs only after per-site approval</p>
            </div>
            <Link href="/notifications" className="inline-flex items-center gap-1 text-xs font-medium text-purple hover:underline">
              Open notification centre <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <DataTable
            rows={sites}
            columns={columns}
            searchKeys={(site) => `${site.name} ${site.host} ${site.primaryMarket} ${site.industry}`}
            pageSize={25}
            exportName="portfolio-sites"
          />
        </Card>
      )}
    </div>
  );
}
