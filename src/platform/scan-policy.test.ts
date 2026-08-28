import { describe, expect, it } from "vitest";
import { estimateScanCost, FULL_SCAN_MODULES, SCAN_MODULES, tiersForModules } from "./scan-policy";

describe("scan-centre policy", () => {
  it("publishes one unique definition for every selectable module", () => {
    expect(SCAN_MODULES).toHaveLength(9);
    expect(new Set(SCAN_MODULES.map((module) => module.id)).size).toBe(9);
    expect(FULL_SCAN_MODULES).toEqual(SCAN_MODULES.map((module) => module.id));
  });

  it("deduplicates modules and separates free work from forecast spend", () => {
    expect(estimateScanCost(["google", "reliability", "ai", "ai"])).toMatchObject({
      estimatedUsd: 0.48,
      paidModules: ["ai"],
      freeModules: ["google", "reliability"],
    });
    expect(estimateScanCost(FULL_SCAN_MODULES).estimatedUsd).toBe(1.17);
  });

  it("maps tool scans onto only the required sync tiers", () => {
    expect(tiersForModules(["google", "technical", "ai"])).toEqual({
      google: true,
      rankings: false,
      dfsLight: false,
      dfsHeavy: true,
      ai: true,
      dedupePaid: false,
      dfsLightModules: [],
    });
    expect(tiersForModules(["competitors"]).dfsLightModules).toEqual(["competitors"]);
  });
});
