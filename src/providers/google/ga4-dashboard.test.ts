import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./auth", () => ({ getGoogleAccessToken: vi.fn().mockResolvedValue("test-token") }));
vi.mock("@/platform/site-store", () => ({ getManagedSite: vi.fn().mockResolvedValue({ ga4PropertyId: "123" }) }));
import { ga4Dashboard, ga4OrganicOverview } from "./ga4";

afterEach(() => vi.unstubAllGlobals());
describe("GA4 dashboard collector", () => {
  it("uses only organic search, full closed dates, and canonical response fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [{ dimensionValues: [{ value: "20260826" }], metricValues: ["12", "7", "20", "2"].map((value) => ({ value })) }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [{ dimensionValues: [{ value: "GB" }, { value: "United Kingdom" }], metricValues: [{ value: "12" }] }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [{ dimensionValues: [{ value: "Home" }, { value: "example.test" }, { value: "/" }], metricValues: [{ value: "20" }] }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await ga4Dashboard("example");
    expect(result.series[0]).toEqual({ date: "2026-08-26", sessions: 12, engagedSessions: 7, views: 20, conversions: 2 });
    expect(result.countries[0]).toEqual({ code: "GB", country: "United Kingdom", sessions: 12 });
    expect(result.pages[0]).toMatchObject({ domainId: "example", title: "Home", views: 20 });
    const requests = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.dimensionFilter.filter.stringFilter.value).toBe("Organic Search");
      expect(request.dateRanges[0].endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(request.dateRanges[0].endDate < new Date().toISOString().slice(0, 10)).toBe(true);
    }
    expect(requests[1].dateRanges).toEqual(requests[2].dateRanges);
  });
  it("propagates report failures instead of inventing successful zero data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { message: "Denied" } }) }));
    await expect(ga4Dashboard("example")).rejects.toThrow("GA4 Data API 403");
  });
});

it("requests exactly 28 closed dates for Analytics totals", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
  vi.stubGlobal("fetch", fetcher);
  await ga4OrganicOverview("example", 28);
  const range = JSON.parse(fetcher.mock.calls[0][1].body).dateRanges[0];
  expect((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000 + 1).toBe(28);
  expect(range.endDate < new Date().toISOString().slice(0, 10)).toBe(true);
});

it("does not include the open US property day when UTC has rolled over", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T06:00:00Z"));
  try {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal("fetch", fetcher);
    const report = await ga4Dashboard("example");
    expect(report.endDate).toBe("2026-09-08");
    await ga4OrganicOverview("example");
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).dateRanges[0]).toEqual({ startDate: "2026-08-12", endDate: "2026-09-08" });
  } finally { vi.useRealTimers(); }
});


it("reads whole-period user and session-duration metrics without summing daily users", async () => {
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({rows:[{metricValues:["100","74","40","60","0.6","8","180","97.5"].map(value=>({value}))}]})});
  vi.stubGlobal("fetch",fetcher);
  const result=await ga4OrganicOverview("example",28);
  expect(result.totalUsers).toBe(74);expect(result.averageSessionDuration).toBe(97.5);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).metrics).toContainEqual({name:"averageSessionDuration"});
});
