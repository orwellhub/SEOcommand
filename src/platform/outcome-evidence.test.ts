import { describe, expect, it } from "vitest";
import type { Provenance } from "@/lib/types";
import type { StoredSnapshot } from "@/sync/store";
import { baselineFromSnapshots, canonicalTarget, measurementFromSnapshots, measurementIsFreshFor, sameTarget } from "./outcome-evidence";

const provenance: Provenance = { source: "google-search-console", collectedAt: "2026-08-28T06:00:00Z", rangeStart: "2026-08-01", rangeEnd: "2026-08-26", location: "sc-domain:example.com", device: "desktop", freshness: "fresh", mode: "live" };
const snapshot = (dataset: string, payload: unknown, capturedOn = "2026-08-28"): StoredSnapshot => ({ dataset, payload, capturedOn, provenance });
const item = { domainSlug: "site", sourceEvidence: { kind: "research", clicks: 4 }, targetUrl: "https://www.example.com/guides/mortgages/", plannedUrl: null, executionData: { targetKeywords: ["best mortgage"] } };

describe("stored outcome evidence", () => {
  it("canonicalises absolute and path-only destinations without crossing hosts", () => {
    expect(canonicalTarget("/guides/mortgages/")).toEqual({ host: null, path: "/guides/mortgages" });
    expect(sameTarget("https://example.com/guides/mortgages", "/guides/mortgages/")).toBe(true);
    expect(sameTarget("https://example.com/guides/mortgages", "https://other.test/guides/mortgages")).toBe(false);
  });

  it("uses the mapped page and query before broader page or site totals", () => {
    const measurement = measurementFromSnapshots(item, [
      snapshot("gsc_query_pages", [
        { key: "best mortgage | https://example.com/guides/mortgages", query: "best mortgage", page: "https://example.com/guides/mortgages", clicks: 12, impressions: 300, ctr: 4, position: 7 },
        { key: "other | https://example.com/guides/mortgages", query: "other", page: "https://example.com/guides/mortgages", clicks: 99, impressions: 900, ctr: 11, position: 2 },
      ]),
      snapshot("gsc_pages", [{ key: "https://example.com/guides/mortgages", clicks: 200, impressions: 5000, ctr: 4, position: 5 }]),
      snapshot("gsc_totals", { clicks: 9000, impressions: 90000, ctr: 10, position: 4 }),
      snapshot("ga4_landing_pages", [{ landingPage: "/guides/mortgages", sessions: 18, totalUsers: 12, engagementRate: 0.7, conversions: 3 }]),
    ]);
    expect(measurement?.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "clicks", value: 12, source: "gsc_page" }),
      expect.objectContaining({ key: "sessions", value: 18, source: "ga4_landing_page" }),
      expect.objectContaining({ key: "conversions", value: 3, source: "ga4_landing_page" }),
    ]));
    expect(measurement?.provenance).toMatchObject({ mode: "stored_first_party", datasets: ["gsc_query_pages", "ga4_landing_pages"], scope: "page", capturedOn: "2026-08-28" });
  });

  it("does not substitute sitewide metrics when a mapped target has no matching evidence", () => {
    expect(measurementFromSnapshots(item, [snapshot("gsc_totals", { clicks: 9000, impressions: 90000, ctr: 10, position: 4 })])).toBeNull();
    const baseline = baselineFromSnapshots(item, [], new Date("2026-08-28T08:00:00Z"));
    expect(baseline.baseline?.provenance?.mode).toBe("attached_evidence");
    expect(baseline.baseline?.metrics[0]).toMatchObject({ key: "clicks", value: 4 });
  });

  it("measures the recorded shipment URL when it differs from the planned path", () => {
    const measurement = measurementFromSnapshots({ ...item, verification: { shipment: { recordedAt: "2026-08-21T00:00:00Z", note: null, url: "https://example.com/live-mortgage-guide" } } }, [snapshot("gsc_pages", [
      { key: "https://example.com/guides/mortgages", clicks: 2, impressions: 20, ctr: 10, position: 9 },
      { key: "https://example.com/live-mortgage-guide", clicks: 8, impressions: 80, ctr: 10, position: 6 },
    ])]);
    expect(measurement?.metrics[0]).toMatchObject({ key: "clicks", value: 8 });
    expect(measurement?.provenance.target).toBe("https://example.com/live-mortgage-guide");
  });

  it("requires a snapshot captured on or after the checkpoint due date", () => {
    const measurement = measurementFromSnapshots(item, [snapshot("gsc_pages", [{ key: "https://example.com/guides/mortgages", clicks: 2, impressions: 20, ctr: 10, position: 9 }])])!;
    expect(measurementIsFreshFor(measurement, "2026-08-28T00:00:00Z")).toBe(true);
    expect(measurementIsFreshFor(measurement, "2026-08-29T00:00:00Z")).toBe(false);
  });
});
