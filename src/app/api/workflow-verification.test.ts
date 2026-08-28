import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PATCH } from "./workflow/tasks/[id]/verification/route";
import { createSessionToken, SESSION_COOKIE, type AppRole } from "@/lib/auth";

async function request(role: AppRole, body: unknown) {
  const token = await createSessionToken({ email: `${role}@orwell.test`, name: role, role, groupIds: [], siteIds: [], allAccess: false, grants: [] }, process.env.AUTH_SECRET!);
  return new Request("https://orwell.test/api/workflow/tasks/60000000-0000-4000-8000-000000000001/verification", { method: "PATCH", headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify(body) });
}

describe("workflow outcome review", () => {
  beforeAll(() => { vi.stubEnv("QA_SYNTHETIC", "true"); vi.stubEnv("AUTH_SECRET", "a-long-test-secret"); });
  afterAll(() => vi.unstubAllEnvs());

  it("closes verification only after a human outcome classification", async () => {
    const awaiting = await PATCH(await request("seo_analyst", { action: "collect_evidence", day: 7 }), { params: Promise.resolve({ id: "60000000-0000-4000-8000-000000000001" }) });
    await expect(awaiting.json()).resolves.toMatchObject({ item: { status: "verifying", verification: { outcome: "awaiting_data" }, verifiedAt: null } });
    const reviewed = await PATCH(await request("seo_analyst", { action: "record_checkpoint", day: 7, metrics: [{ key: "clicks", label: "Clicks", value: 150, unit: "count", source: "gsc_page" }], outcome: "won", confidence: "high", note: "Sustained organic improvement." }), { params: Promise.resolve({ id: "60000000-0000-4000-8000-000000000001" }) });
    await expect(reviewed.json()).resolves.toMatchObject({ item: { status: "done", verification: { outcome: "won", confidence: "high" } } });
  });

  it("keeps viewers out of verification mutations", async () => {
    const response = await PATCH(await request("viewer", { action: "capture_baseline" }), { params: Promise.resolve({ id: "60000000-0000-4000-8000-000000000001" }) });
    expect(response.status).toBe(403);
  });
});
