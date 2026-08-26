"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, LockKeyhole, Radio, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, CardHeader, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { AreaTrend } from "@/components/charts/charts";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { formatDate } from "@/lib/dates";

interface CheckRow {
  id: string;
  siteSlug: string;
  checkedAt: string;
  available: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  tlsValid: boolean | null;
  tlsExpiresAt: string | null;
  domainExpiresAt: string | null;
  robotsStatus: number | null;
  sitemapStatus: number | null;
}

interface MonitoringData {
  summary: { monitored: number; available: number; incidents: number; avgResponseMs: number | null; uptimePct: number | null };
  latest: CheckRow[];
  checks: CheckRow[];
}

export default function MonitoringPage() {
  const { scope, sites } = useDomain();
  const domain = useResolvedDomain();
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/monitoring?scope=${encodeURIComponent(scope)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Monitoring data could not be loaded.");
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Monitoring data could not be loaded.");
    } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const runCheck = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/monitoring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteSlug: domain.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Check failed.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Check failed."); }
    finally { setBusy(false); }
  };

  const siteName = useCallback((slug: string) => sites.find((site) => site.id === slug)?.name ?? slug, [sites]);
  const trend = useMemo(() => [...(data?.checks ?? [])].reverse().map((row) => ({ date: row.checkedAt, response: row.responseTimeMs ?? 0 })), [data]);
  const columns = useMemo<Column<CheckRow>[]>(() => [
    { key: "site", header: "Website", sortValue: (row) => siteName(row.siteSlug), render: (row) => <span className="font-medium text-ink">{siteName(row.siteSlug)}</span> },
    { key: "status", header: "Status", sortValue: (row) => row.available ? 1 : 0, render: (row) => <StatusBadge label={row.available ? "Available" : "Incident"} tone={row.available ? "success" : "critical"} /> },
    { key: "http", header: "HTTP", align: "right", sortValue: (row) => row.statusCode ?? 0, render: (row) => row.statusCode ?? "—" },
    { key: "response", header: "Response", align: "right", sortValue: (row) => row.responseTimeMs ?? 0, render: (row) => row.responseTimeMs == null ? "—" : `${row.responseTimeMs} ms` },
    { key: "tls", header: "TLS", render: (row) => <StatusBadge label={row.tlsValid === true ? "Valid" : row.tlsValid === false ? "Invalid" : "Unknown"} tone={row.tlsValid === true ? "success" : row.tlsValid === false ? "critical" : "neutral"} /> },
    { key: "checked", header: "Last checked", align: "right", sortValue: (row) => row.checkedAt, render: (row) => formatDate(row.checkedAt) },
  ], [siteName]);

  if (loading && !data) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  return <div className="animate-in space-y-5">
    <PageHeader title="Reliability monitoring" description="Availability, response time, TLS, domain expiry and search-control file changes across the portfolio." actions={scope !== "portfolio" && !scope.startsWith("group:") ? <Button onClick={runCheck} disabled={busy}><RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Check now</Button> : undefined} />
    {error && <div role="alert" className="rounded-md border border-critical/20 bg-critical/5 p-3 text-xs text-critical">{error}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="Websites monitored" value={String(data?.summary.monitored ?? 0)} hint="Current scope" />
      <KpiCard label="Available now" value={String(data?.summary.available ?? 0)} hint="Latest successful check" accent />
      <KpiCard label="Open incidents" value={String(data?.summary.incidents ?? 0)} hint="Availability or TLS" />
      <KpiCard label="Average response" value={data?.summary.avgResponseMs == null ? "—" : `${data.summary.avgResponseMs} ms`} hint={data?.summary.uptimePct == null ? "Last 24 hours" : `${data.summary.uptimePct}% uptime · 24h`} />
    </div>
    <div className="grid gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3"><CardHeader title="Response-time evidence" subtitle="Every check is retained; alerts are created only on a state change." action={<Activity className="h-4 w-4 text-purple" />} /><div className="p-3">{trend.length ? <AreaTrend data={trend} dataKey="response" height={230} /> : <EmptyState title="Awaiting the first reliability run" description="The hourly operations job will populate this timeline." />}</div></Card>
      <Card className="xl:col-span-2"><CardHeader title="What is watched" subtitle="Independent of analytics and ranking providers" /><div className="grid grid-cols-2 gap-px bg-border">
        {[{ icon: Radio, title: "Availability", detail: "HTTP status and recovery" }, { icon: Clock3, title: "Latency", detail: "Response-time movement" }, { icon: LockKeyhole, title: "TLS & domain", detail: "Validity and expiry" }, { icon: RefreshCw, title: "Search controls", detail: "robots.txt and sitemap changes" }].map(({ icon: Icon, title, detail }) => <div key={title} className="bg-card p-4"><Icon className="h-4 w-4 text-purple" /><div className="mt-2 text-xs font-semibold text-ink">{title}</div><div className="mt-1 text-2xs text-muted">{detail}</div></div>)}
      </div></Card>
    </div>
    <Card><CardHeader title="Current portfolio state" subtitle="Most recent evidence for each website" />{data?.latest.length ? <DataTable<CheckRow> rows={data.latest} columns={columns} searchPlaceholder="Search websites…" rowKey={(row) => row.id} /> : <div className="p-4"><EmptyState title="No checks recorded" description="Run a check for one website or wait for the hourly operations job." /></div>}</Card>
  </div>;
}
