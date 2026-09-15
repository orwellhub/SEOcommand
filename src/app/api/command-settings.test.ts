import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { POST } from "./command/route";
import { commandRecords, saveCommandRecord } from "@/platform/command-store";
vi.mock("@/lib/auth", () => ({ sessionFromRequest: async () => ({ email: "owner@test.local" }) }));
vi.mock("@/platform/access", () => ({ canAccessSite: async () => true, hasPermission: async () => true }));
vi.mock("@/platform/site-store", () => ({ getManagedSite: async () => ({ id: "globalbusrental", host: "globalbusrental.com" }) }));
const request = (input: Record<string, unknown>) => new Request("https://test.local/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ site: "globalbusrental", action: "crawl_settings", ...input }) });
beforeAll(() => vi.stubEnv("QA_SYNTHETIC", "true"));
afterAll(() => vi.unstubAllEnvs());
it("persists crawl limits including zero depth/delay while preserving other preferences", async () => {
  await saveCommandRecord("globalbusrental", "settings", "preferences", { brandTerms: ["Global Bus Rental"], businessEvents: { enquiry: "enquiry" } });
  expect((await POST(request({ crawlPageLimit: 20, crawlMaxDepth: 0, crawlDelayMs: 0, exclusions: ["/account", "/account"] }))).status).toBe(200);
  expect((await commandRecords("globalbusrental")).find(r => r.kind === "settings")?.payload).toMatchObject({ crawlPageLimit: 20, crawlMaxDepth: 0, crawlDelayMs: 0, crawlExclusions: ["/account"], brandTerms: ["Global Bus Rental"], businessEvents: { enquiry: "enquiry" } });
});
it("rejects invalid crawl limits without changing saved settings", async () => {
  const before = (await commandRecords("globalbusrental")).find(r => r.kind === "settings")?.payload;
  expect((await POST(request({ crawlPageLimit: 0 }))).status).toBe(400);
  expect((await POST(request({ crawlDelayMs: -1 }))).status).toBe(400);
  expect((await commandRecords("globalbusrental")).find(r => r.kind === "settings")?.payload).toEqual(before);
});
