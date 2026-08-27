import { describe, expect, it } from "vitest";
import { applyLearningAdjustment, buildLearningSignals, metricDeltas } from "./outcome-ledger";

describe("outcome ledger", () => {
  it("calculates absolute and percentage movement", () => { expect(metricDeltas({ baseline: { capturedAt: "x", metrics: [{ key: "clicks", label: "Clicks", value: 100, unit: "count", source: "gsc" }] }, checkpoints: [{ day: 7, dueAt: "x", status: "recorded", metrics: [{ key: "clicks", label: "Clicks", value: 125, unit: "count", source: "gsc" }] }] })[0]).toMatchObject({ current: 125, absoluteChange: 25, percentChange: 25, direction: "up" }); });
  it("creates a bounded transparent learning adjustment", () => { const base = { domainSlug: "site", executionType: "refresh_brief", verification: {}, id: "1" } as any; const [signal] = buildLearningSignals([{ ...base, verification: { outcome: "won" } }, { ...base, id: "2", verification: { outcome: "won" } }]); expect(signal?.adjustment).toBe(10); expect(applyLearningAdjustment(95, signal)).toBe(100); });
});
