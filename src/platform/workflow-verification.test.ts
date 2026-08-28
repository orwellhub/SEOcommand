import { describe, expect, it } from "vitest";
import { captureBaseline, captureMetricBaseline, evidenceMetrics, recordCheckpoint, recordShipment } from "./workflow-verification";

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

  it("retains immutable source provenance through an automated checkpoint", () => {
    const provenance = { mode: "stored_first_party" as const, datasets: ["gsc_pages"], capturedOn: "2026-08-28", scope: "page" as const, target: "https://example.com/page" };
    const baseline = captureMetricBaseline([{ key: "clicks", label: "Clicks", value: 10, unit: "count", source: "gsc_page" }], provenance, new Date("2026-08-01T00:00:00Z"));
    const shipped = recordShipment(baseline, {}, new Date("2026-08-21T00:00:00Z"));
    const checked = recordCheckpoint(shipped, { day: 7, metrics: [{ key: "clicks", label: "Clicks", value: 14, unit: "count", source: "gsc_page" }], provenance });
    expect(checked.baseline?.provenance).toEqual(provenance);
    expect(checked.checkpoints?.[0]?.provenance).toEqual(provenance);
  });

  it("does not overwrite a human outcome note when later evidence is collected", () => {
    const shipped = recordShipment(captureBaseline({ clicks: 10 }), {}, new Date("2026-08-01T00:00:00Z"));
    const reviewed = recordCheckpoint(shipped, { day: 7, metrics: [], outcome: "won", note: "The page gained qualified clicks." });
    const later = recordCheckpoint(reviewed, { day: 14, metrics: [], note: "Collected automatically from stored data." });
    expect(later.outcomeNote).toBe("The page gained qualified clicks.");
    expect(later.checkpoints?.[1]?.note).toBe("Collected automatically from stored data.");
  });
});
