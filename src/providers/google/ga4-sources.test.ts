import { afterEach, expect, it, vi } from "vitest";
vi.mock("./auth", () => ({ getGoogleAccessToken: vi.fn().mockResolvedValue("test-token") }));
vi.mock("@/platform/site-store", () => ({ getManagedSite: vi.fn().mockResolvedValue({ ga4PropertyId: "123" }) }));
import { ga4Sources } from "./ga4";

afterEach(() => vi.unstubAllGlobals());

const dims = (...v: string[]) => v.map((value) => ({ value }));

it("splits two adjacent 28-day windows by source and joins generate_lead counts", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ rowCount: 3, rows: [
      { dimensionValues: dims("chatgpt.com", "referral", "Referral", "current"), metricValues: ["12", "9", "3"].map((value) => ({ value })) },
      { dimensionValues: dims("google", "organic", "Organic Search", "current"), metricValues: ["100", "60", "8"].map((value) => ({ value })) },
      { dimensionValues: dims("chatgpt.com", "referral", "Referral", "previous"), metricValues: ["5", "4", "1"].map((value) => ({ value })) },
    ] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [{ dimensionValues: dims("chatgpt.com", "referral", "Referral", "current"), metricValues: [{ value: "2" }] }] }) });
  vi.stubGlobal("fetch", fetcher);
  const out = await ga4Sources("example", 28);
  expect(out.current.rows[0]).toEqual({ source: "chatgpt.com", medium: "referral", channel: "Referral", sessions: 12, engagedSessions: 9, keyEvents: 3, leads: 2 });
  expect(out.previous.rows).toHaveLength(1);
  expect(out.previous.rows[0]!.leads).toBe(0);
  const [traffic, leads] = fetcher.mock.calls.map((c) => JSON.parse(c[1].body));
  expect(traffic.dimensionFilter).toBeUndefined();
  expect(traffic.dateRanges.map((r: { name: string }) => r.name)).toEqual(["current", "previous"]);
  const [cur, prev] = traffic.dateRanges;
  expect((Date.parse(cur.endDate) - Date.parse(cur.startDate)) / 86400000 + 1).toBe(28);
  expect((Date.parse(cur.startDate) - Date.parse(prev.endDate)) / 86400000).toBe(1);
  expect(leads.dimensionFilter.filter.stringFilter.value).toBe("generate_lead");
  expect(out.leadsCounted).toBe(true);
});

it("keeps sessions when the lead report fails, and says leads were not counted", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [{ dimensionValues: dims("bing", "organic", "Organic Search", "current"), metricValues: ["4", "2", "0"].map((value) => ({ value })) }] }) })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: "bad" } }) });
  vi.stubGlobal("fetch", fetcher);
  const out = await ga4Sources("example", 28);
  expect(out.current.rows[0]!.sessions).toBe(4);
  expect(out.leadsCounted).toBe(false);
});
