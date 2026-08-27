import { describe, expect, it } from "vitest";
import { captureBaseline, evidenceMetrics, recordCheckpoint, recordShipment } from "./workflow-verification";

describe("workflow verification", () => {
  it("turns attached evidence into a provenance-preserving baseline", () => {
    expect(evidenceMetrics({ kind: "gsc_page", clicks: 120, impressions: 4000, position: 8.2 })).toEqual([
      { key: "clicks", label: "Clicks", value: 120, unit: "count", source: "gsc_page" },
      { key: "impressions", label: "Impressions", value: 4000, unit: "count", source: "gsc_page" },
      { key: "position", label: "Average position", value: 8.2, unit: "position", source: "gsc_page" },
    ]);
  });

  it("schedules 7, 14 and 28 day checks from shipment", () => {
    const baseline = captureBaseline({ clicks: 12 }, new Date("2026-08-01T00:00:00Z"));
    const shipped = recordShipment(baseline, { note: "Published" }, new Date("2026-08-10T00:00:00Z"));
    expect(shipped.checkpoints?.map((item) => item.day)).toEqual([7, 14, 28]);
    const checked = recordCheckpoint(shipped, { day: 7, metrics: [], outcome: "won" }, new Date("2026-08-17T00:00:00Z"));
    expect(checked.checkpoints?.[0]?.status).toBe("recorded");
    expect(checked.outcome).toBe("won");
  });
});
