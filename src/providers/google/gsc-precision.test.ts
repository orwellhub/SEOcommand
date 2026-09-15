import { afterEach, expect, it, vi } from "vitest";
import { gscTotals, gscTimeseries } from "./gsc";
import { searchSummary } from "@/lib/dashboard-data";
vi.mock("./auth", () => ({ getGoogleAccessToken: async () => "test-token" }));
vi.mock("@/platform/site-store", () => ({ getManagedSite: async () => ({ gscSite: "sc-domain:globalbusrental.com" }) }));
afterEach(() => vi.unstubAllGlobals());
it("retains Google's precision so weighted daily positions reconcile with the aggregate", async () => {
  const daily = [
    {keys:["2026-09-09"],clicks:5,impressions:100,ctr:.05,position:9.746},
    {keys:["2026-09-10"],clicks:6,impressions:100,ctr:.06,position:9.756},
  ];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({rows:body.dimensions.length ? daily : [{clicks:11,impressions:200,ctr:.055,position:9.751}]}));
  }));
  const total = await gscTotals("globalbusrental"), series = await gscTimeseries("globalbusrental");
  expect(series[0].position).toBe(9.746);
  expect(searchSummary(series)?.position).toBeCloseTo(total.position, 10);
  expect(total.position.toFixed(1)).toBe("9.8");
});
