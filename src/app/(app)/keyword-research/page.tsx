"use client";

import { useMemo, useState } from "react";
import { ScanSearch, Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  Button,
  EmptyState,
  Skeleton,
  StatusBadge,
  SourceBadge,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Sparkline } from "@/components/charts/sparkline";
import { compactNumber, currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MARKETS, DEFAULT_MARKET } from "@/lib/markets";
import type { KeywordResearchResult, KeywordResearchRow } from "@/lib/types";

/* ------------------------------- helpers -------------------------------- */

const DEPTHS = [50, 100, 250, 500];

function fmtVolume(n: number | null): string {
  return n == null ? "—" : compactNumber(n);
}
function fmtCpc(n: number | null): string {
  return n == null ? "—" : currency(n);
}
function fmtDifficulty(n: number | null): string {
  return n == null ? "—" : String(Math.round(n));
}

/** Keyword difficulty tone: 0-29 easy, 30-59 moderate, 60+ hard. */
function difficultyTone(n: number | null): "success" | "warning" | "critical" | "neutral" {
  if (n == null) return "neutral";
  if (n < 30) return "success";
  if (n < 60) return "warning";
  return "critical";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* -------------------------------- page ---------------------------------- */

export default function KeywordResearchPage() {
  const [seed, setSeed] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_MARKET.code);
  const [depth, setDepth] = useState(100);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeywordResearchResult | null>(null);

  const rows = useMemo(() => result?.rows ?? [], [result]);

  const kpis = useMemo(() => {
    const volumes = rows.map((r) => r.volume).filter((v): v is number => v != null);
    const difficulties = rows.map((r) => r.difficulty).filter((v): v is number => v != null);
    const cpcs = rows.map((r) => r.cpc).filter((v): v is number => v != null);
    return {
      count: rows.length,
      totalVolume: volumes.reduce((a, b) => a + b, 0),
      avgDifficulty: Math.round(mean(difficulties)),
      avgCpc: mean(cpcs),
    };
  }, [rows]);

  async function runScan(e?: React.FormEvent) {
    e?.preventDefault();
    const term = seed.trim();
    if (!term || loading) return;
    setLoading(true);
    setError(null);
    try {
      const market = MARKETS.find((m) => m.code === locationCode) ?? DEFAULT_MARKET;
      const qs = new URLSearchParams({
        seed: term,
        location: String(market.code),
        language: market.language,
        limit: String(depth),
      });
      const res = await fetch(`/api/keyword-research?${qs.toString()}`);
      const data = await res.json();
      if (!data.ok) {
        setResult(null);
        setError(data.message ?? "Keyword research failed.");
        return;
      }
      setResult(data.result as KeywordResearchResult);
    } catch {
      setResult(null);
      setError("Could not reach the keyword-research service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadExcel() {
    if (!result || result.rows.length === 0 || exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/keyword-research/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: result.seed,
          locationLabel: result.locationLabel,
          fetchedAt: result.fetchedAt,
          rows: result.rows,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `keyword-research-${result.seed.replace(/[^a-z0-9]+/gi, "-")}-${result.fetchedAt}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Excel export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<KeywordResearchRow>[] = [
    {
      key: "keyword",
      header: "Keyword",
      sortValue: (r) => r.keyword,
      render: (r) => <span className="font-medium text-ink">{r.keyword}</span>,
      width: "34%",
    },
    {
      key: "volume",
      header: "Volume",
      align: "right",
      sortValue: (r) => r.volume ?? -1,
      render: (r) => <span className="tnum">{fmtVolume(r.volume)}</span>,
    },
    {
      key: "difficulty",
      header: "Difficulty",
      align: "right",
      sortValue: (r) => r.difficulty ?? -1,
      render: (r) => <StatusBadge label={fmtDifficulty(r.difficulty)} tone={difficultyTone(r.difficulty)} />,
    },
    {
      key: "cpc",
      header: "CPC",
      align: "right",
      sortValue: (r) => r.cpc ?? -1,
      render: (r) => <span className="tnum">{fmtCpc(r.cpc)}</span>,
    },
    {
      key: "competitionLevel",
      header: "Competition",
      align: "center",
      sortValue: (r) => r.competition ?? -1,
      render: (r) =>
        r.competitionLevel ? (
          <span className="text-xs capitalize text-muted">{r.competitionLevel}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "intent",
      header: "Intent",
      align: "center",
      sortValue: (r) => r.intent ?? "",
      render: (r) =>
        r.intent ? (
          <span className="text-xs capitalize text-muted">{r.intent}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "trend",
      header: "12-mo trend",
      align: "right",
      render: (r) =>
        r.trend.length > 1 ? (
          <Sparkline data={r.trend} className="ml-auto h-7 w-24" />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  const hasResult = result !== null && rows.length > 0;

  return (
    <div>
      <PageHeader
        title="Keyword Research"
        description="Scan a seed keyword against a chosen SERP market for live search volume, keyword difficulty and CPC — powered by DataForSEO. Download the full dataset as Excel."
        lastSync={result?.fetchedAt ?? null}
        actions={
          <Button variant="primary" onClick={downloadExcel} disabled={!hasResult || exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download Excel
          </Button>
        }
      />

      {/* Search controls */}
      <Card className="mb-5 p-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={runScan}>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
              Seed keyword
            </label>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. solar panels"
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
              Market
            </label>
            <select
              value={locationCode}
              onChange={(e) => setLocationCode(Number(e.target.value))}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-ink focus:outline-none focus-visible:outline-2"
            >
              {MARKETS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
              Depth
            </label>
            <select
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-ink focus:outline-none focus-visible:outline-2"
            >
              {DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {d} keywords
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={!seed.trim() || loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            Run scan
          </Button>
          <div className="ml-auto self-center">
            <SourceBadge source="dataforseo" mode="live" />
          </div>
        </form>
      </Card>

      {/* States */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <EmptyState
          title="Scan unavailable"
          description={error}
          icon={<ScanSearch className="h-6 w-6" />}
        />
      ) : hasResult ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Keywords" value={compactNumber(kpis.count)} hint={`Market: ${result!.locationLabel}`} />
            <KpiCard label="Total volume" value={compactNumber(kpis.totalVolume)} hint="Monthly searches" />
            <KpiCard label="Avg difficulty" value={fmtDifficulty(kpis.avgDifficulty)} hint="0–100 scale" />
            <KpiCard label="Avg CPC" value={fmtCpc(kpis.avgCpc)} hint="Google Ads" />
          </div>

          <Card className={cn("p-4")}>
            <DataTable
              rows={rows}
              columns={columns}
              searchKeys={(r) => r.keyword}
              searchPlaceholder="Filter keywords…"
              pageSize={15}
            />
            <p className="mt-3 text-2xs text-muted">
              Showing key metrics. Use <span className="font-medium text-ink">Download Excel</span> for the full
              dataset, including competition, top-of-page bids and the complete monthly search history per keyword.
            </p>
          </Card>
        </div>
      ) : (
        <EmptyState
          title="Run your first keyword scan"
          description="Enter a seed keyword and market above, then press Run scan. Results appear here and can be exported to Excel."
          icon={<ScanSearch className="h-6 w-6" />}
        />
      )}
    </div>
  );
}
