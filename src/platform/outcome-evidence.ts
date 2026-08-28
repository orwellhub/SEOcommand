import type { Ga4LandingPage, GscQueryPageRow, GscRow, GscTotals, Provenance } from "@/lib/types";
import type { StoredSnapshot } from "@/sync/store";
import { captureBaseline, captureMetricBaseline, type Metric, type VerificationProvenance, type VerificationState } from "./workflow-verification";

export type MeasurableWorkflowItem = {
  domainSlug: string;
  sourceEvidence: Record<string, unknown>;
  targetUrl: string | null;
  plannedUrl: string | null;
  executionData: Record<string, unknown>;
  verification?: Record<string, unknown>;
};

export type StoredMeasurement = {
  metrics: Metric[];
  provenance: VerificationProvenance;
};

function asRows<T>(snapshot: StoredSnapshot | undefined): T[] {
  return Array.isArray(snapshot?.payload) ? snapshot.payload as T[] : [];
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function canonicalTarget(value: string | null | undefined): { host: string | null; path: string } | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://relative.invalid");
    const path = `${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`.toLowerCase();
    return { host: url.hostname === "relative.invalid" ? null : url.hostname.replace(/^www\./, "").toLowerCase(), path };
  } catch {
    return null;
  }
}

export function sameTarget(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = canonicalTarget(left); const b = canonicalTarget(right);
  if (!a || !b || a.path !== b.path) return false;
  return !a.host || !b.host || a.host === b.host;
}

function targetKeywords(item: MeasurableWorkflowItem): string[] {
  const values = item.executionData.targetKeywords;
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").map((value) => value.trim().toLowerCase()).filter(Boolean) : [];
}

function aggregateGsc(rows: GscRow[], source: string): Metric[] {
  if (!rows.length) return [];
  const clicks = rows.reduce((sum, row) => sum + (finite(row.clicks) ? row.clicks : 0), 0);
  const impressions = rows.reduce((sum, row) => sum + (finite(row.impressions) ? row.impressions : 0), 0);
  const weightedPosition = rows.reduce((sum, row) => sum + (finite(row.position) ? row.position : 0) * Math.max(1, finite(row.impressions) ? row.impressions : 0), 0);
  const weight = rows.reduce((sum, row) => sum + Math.max(1, finite(row.impressions) ? row.impressions : 0), 0);
  return [
    { key: "clicks", label: "Clicks", value: clicks, unit: "count", source },
    { key: "impressions", label: "Impressions", value: impressions, unit: "count", source },
    { key: "position", label: "Average position", value: weight ? Math.round(weightedPosition / weight * 10) / 10 : 0, unit: "position", source },
  ];
}

function provenance(snapshot: StoredSnapshot, datasets: string[], scope: VerificationProvenance["scope"], target: string | null): VerificationProvenance {
  const detail = snapshot.provenance as Provenance;
  return { mode: "stored_first_party", datasets, capturedOn: snapshot.capturedOn, rangeStart: detail.rangeStart ?? null, rangeEnd: detail.rangeEnd ?? null, scope, target };
}

function addGa4(metrics: Metric[], snapshot: StoredSnapshot | undefined, target: string | null, datasets: string[], primaryCapturedOn: string) {
  if (!target || snapshot?.capturedOn !== primaryCapturedOn) return;
  const matched = asRows<Ga4LandingPage>(snapshot).filter((row) => sameTarget(row.landingPage, target));
  if (!matched.length) return;
  datasets.push("ga4_landing_pages");
  metrics.push(
    { key: "sessions", label: "Organic sessions", value: matched.reduce((sum, row) => sum + row.sessions, 0), unit: "count", source: "ga4_landing_page" },
    { key: "conversions", label: "Conversions", value: matched.reduce((sum, row) => sum + row.conversions, 0), unit: "count", source: "ga4_landing_page" },
  );
}

/** Resolve outcome evidence exclusively from snapshots already stored by the
 * daily free Google sync. It never invokes a provider. */
export function measurementFromSnapshots(item: MeasurableWorkflowItem, snapshots: StoredSnapshot[]): StoredMeasurement | null {
  const byDataset = new Map(snapshots.map((snapshot) => [snapshot.dataset, snapshot]));
  const shipmentUrl = (item.verification as VerificationState | undefined)?.shipment?.url;
  const target = shipmentUrl ?? item.targetUrl ?? item.plannedUrl;
  const keywords = new Set(targetKeywords(item));
  const queryPagesSnapshot = byDataset.get("gsc_query_pages");
  const pagesSnapshot = byDataset.get("gsc_pages");
  const queriesSnapshot = byDataset.get("gsc_queries");
  const totalsSnapshot = byDataset.get("gsc_totals");
  let primary: StoredSnapshot | undefined;
  let scope: VerificationProvenance["scope"] = "site";
  let rows: GscRow[] = [];

  if (target && queryPagesSnapshot) {
    const matched = asRows<GscQueryPageRow>(queryPagesSnapshot).filter((row) => sameTarget(row.page, target) && (!keywords.size || keywords.has(row.query.trim().toLowerCase())));
    if (matched.length) { rows = matched; primary = queryPagesSnapshot; scope = "page"; }
  }
  if (!rows.length && target && pagesSnapshot) {
    const matched = asRows<GscRow>(pagesSnapshot).filter((row) => sameTarget(row.key, target));
    if (matched.length) { rows = matched; primary = pagesSnapshot; scope = "page"; }
  }
  if (!rows.length && keywords.size && queriesSnapshot) {
    const matched = asRows<GscRow>(queriesSnapshot).filter((row) => keywords.has(row.key.trim().toLowerCase()));
    if (matched.length) { rows = matched; primary = queriesSnapshot; scope = "query"; }
  }

  const datasets: string[] = [];
  let metrics: Metric[] = [];
  if (primary) {
    datasets.push(primary.dataset);
    metrics = aggregateGsc(rows, scope === "page" ? "gsc_page" : "gsc_query");
  } else if (!target && !keywords.size && totalsSnapshot && totalsSnapshot.payload && typeof totalsSnapshot.payload === "object") {
    const totals = totalsSnapshot.payload as GscTotals;
    if (finite(totals.clicks) && finite(totals.impressions) && finite(totals.position)) {
      primary = totalsSnapshot; datasets.push(totalsSnapshot.dataset); scope = "site";
      metrics = [
        { key: "clicks", label: "Clicks", value: totals.clicks, unit: "count", source: "gsc_site" },
        { key: "impressions", label: "Impressions", value: totals.impressions, unit: "count", source: "gsc_site" },
        { key: "position", label: "Average position", value: totals.position, unit: "position", source: "gsc_site" },
      ];
    }
  }
  if (!primary || !metrics.length) return null;
  addGa4(metrics, byDataset.get("ga4_landing_pages"), target, datasets, primary.capturedOn);
  return { metrics, provenance: provenance(primary, datasets, scope, target ?? (keywords.size ? [...keywords].join(", ") : item.domainSlug)) };
}

export function baselineFromSnapshots(item: MeasurableWorkflowItem, snapshots: StoredSnapshot[], now = new Date()): VerificationState {
  const measurement = measurementFromSnapshots(item, snapshots);
  if (measurement) return captureMetricBaseline(measurement.metrics, measurement.provenance, now);
  return captureBaseline(item.sourceEvidence, now, { mode: "attached_evidence", datasets: [], capturedOn: null, scope: "attached", target: item.targetUrl ?? item.plannedUrl });
}

export function measurementIsFreshFor(measurement: StoredMeasurement, dueAt: string): boolean {
  return Boolean(measurement.provenance.capturedOn && measurement.provenance.capturedOn >= dueAt.slice(0, 10));
}
