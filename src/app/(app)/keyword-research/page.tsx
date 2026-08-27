"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SavedScans, type SavedScan } from "@/components/keyword-research/saved-scans";
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

  // Saved search history.
  const [scans, setScans] = useState<SavedScan[]>([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [busyScanId, setBusyScanId] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const rows = useMemo(() => result?.rows ?? [], [result]);

  const loadScans = useCallback(async () => {
    try {
      const res = await fetch("/api/keyword-research/scans");
      const data = await res.json();
      setScans(data.ok ? (data.scans as SavedScan[]) : []);
    } catch {
      setScans([]);
    } finally {
      setScansLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  /** Persist a completed scan so it can be reopened later without re-spending. */
  const saveScan = useCallback(
    async (scan: KeywordResearchResult) => {
      try {
        const res = await fetch("/api/keyword-research/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seed: scan.seed,
            locationCode: scan.locationCode,
            languageCode: scan.languageCode,
            locationLabel: scan.locationLabel,
            rows: scan.rows,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.ok && data.scan?.id) {
          setActiveScanId(data.scan.id as string);
          if (data.synthetic) {
            setScans((current) => [data.scan as SavedScan, ...current.filter((item) => item.id !== data.scan.id)]);
            return;
          }
        }
        await loadScans();
      } catch {
        // History is a convenience — a save failure must not lose the results
        // already on screen, so this stays silent.
      }
    },
    [loadScans],
  );

  /** Reopen a stored scan. Served from Postgres — no DataForSEO call, no spend. */
  async function openScan(scan: SavedScan) {
    if (busyScanId) return;
    setBusyScanId(scan.id);
    setError(null);
    try {
      const res = await fetch(`/api/keyword-research/scans/${scan.id}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not open that saved search.");
        return;
      }
      setResult(data.result as KeywordResearchResult);
      setActiveScanId(scan.id);
      setReplayed(true);
      setSeed(scan.seed);
      setLocationCode(scan.locationCode);
    } catch {
      setError("Could not open that saved search.");
    } finally {
      setBusyScanId(null);
    }
  }

  async function deleteScan(scan: SavedScan) {
    if (busyScanId) return;
    if (!window.confirm(`Delete the saved search "${scan.seed}"?`)) return;
    setBusyScanId(scan.id);
    try {
      const res = await fetch(`/api/keyword-research/scans/${scan.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not delete that saved search.");
        return;
      }
      if (activeScanId === scan.id) setActiveScanId(null);
      await loadScans();
    } catch {
      setError("Could not delete that saved search.");
    } finally {
      setBusyScanId(null);
    }
  }

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
      const scan = data.result as KeywordResearchResult;
      setResult(scan);
      setReplayed(false);
      setActiveScanId(null);
      if (scan.rows.length > 0) await saveScan(scan);
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
            <label htmlFor="keyword-seed" className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
              Seed keyword
            </label>
            <input
              id="keyword-seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. solar panels"
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2"
            />
          </div>
          <div>
            <label htmlFor="keyword-market" className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
              Market
            </label>
            <select
              id="keyword-market"
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
            <label htmlFor="keyword-depth" className="mb-1 block text-2xs font-medium uppercase tracking-wide text-muted">
              Depth
            </label>
            <select
              id="keyword-depth"
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

      {/* Results alongside the saved-search history */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
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
              {replayed && (
                <span className="mr-1 font-medium text-ink">
                  Reopened from saved searches — no DataForSEO call was made.
                </span>
              )}
              Showing key metrics. Use <span className="font-medium text-ink">Download Excel</span> for the full
              dataset, including competition, top-of-page bids and the complete monthly search history per keyword.
            </p>
          </Card>
        </div>
      ) : (
        <EmptyState
          title="Run your first keyword scan"
          description="Enter a seed keyword and market above, then press Run scan. Every scan is saved automatically so you can reopen it later."
          icon={<ScanSearch className="h-6 w-6" />}
        />
          )}
        </div>

        <SavedScans
          scans={scans}
          loading={scansLoading}
          activeId={activeScanId}
          busyId={busyScanId}
          onOpen={openScan}
          onDelete={deleteScan}
        />
      </div>
    </div>
  );
}
