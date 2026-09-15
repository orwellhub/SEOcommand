import { expect, it } from "vitest";
import { matchingDomainHistory } from "./domain-history";
import type { ResearchRun } from "./research-evidence";

function saved(patch: Partial<ResearchRun> = {}): ResearchRun {
  return { id: "traffic", siteSlug: "one", feature: "traffic", status: "completed", createdAt: "2026-09-15", updatedAt: "2026-09-15", nextRunAt: null,
    payload: { input: { feature: "traffic", domains: ["example.com"], keywords: [], device: "desktop", platform: "google" }, market: { locationCode: 2826, languageCode: "en", label: "UK" }, units: [], notes: [], estimateUsd: .22,
      report: { notes: [], series: [], tables: [{ title: "example.com: monthly history", columns: ["Estimated traffic"], total: 1, rows: [{ id: "2026-08-01", label: "August", values: { "Estimated traffic": 0 } }] }] } }, ...patch };
}
it("reuses completed traffic history without replacing measured zeroes or saved evidence", () => {
  const run = saved(), before = JSON.stringify(run);
  expect(matchingDomainHistory([run], "one", "https://www.example.com/", 2826, "en")).toBe(run);
  expect(JSON.stringify(run)).toBe(before);
});
it("keeps site, target, country, language, status and actual history boundaries", () => {
  const run = saved();
  for (const args of [["two", "example.com", 2826, "en"], ["one", "other.com", 2826, "en"], ["one", "example.com", 2840, "en"], ["one", "example.com", 2826, "fr"]] as const)
    expect(matchingDomainHistory([run], args[0], args[1], args[2], args[3])).toBeUndefined();
  expect(matchingDomainHistory([saved({ status: "running" }), saved({ payload: { ...run.payload, report: undefined } })], "one", "example.com", 2826, "en")).toBeUndefined();
});
it("selects the newest matching historical collection across both research entry points", () => {
  const old = saved({ id: "old", feature: "history", updatedAt: "2026-09-12" }), newest = saved();
  expect(matchingDomainHistory([old, newest], "one", "example.com", 2826, "en")?.id).toBe("traffic");
});
