import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "./workflow/tasks/route";
import { createSessionToken, SESSION_COOKIE, type AppRole } from "@/lib/auth";

async function request(role: AppRole) {
  const token = await createSessionToken({ email: `${role}@orwell.test`, name: role, role, groupIds: [], siteIds: [], allAccess: false, grants: [] }, process.env.AUTH_SECRET!);
  return new Request("https://orwell.test/api/workflow/tasks", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify({
      siteSlug: "mortgagecompare",
      findingKey: "technical:sample-issue",
      title: "Repair canonical tags on affected pages",
      module: "Technical",
      executionType: "technical_task",
      priorityScore: 85,
      pageMode: "existing_page",
      targetUrl: "https://mortgagecompare.ae/mortgages",
      targetKeywords: [],
      ownerEmail: "seo_analyst@orwell.test",
      dueDate: "2026-09-10",
      sourceUrl: "/site-audit?site=mortgagecompare",
      sourceEvidence: { kind: "technical_issue", affectedPages: 4 },
    }),
  });
}

describe("site finding to execution work", () => {
  beforeAll(() => {
    vi.stubEnv("QA_SYNTHETIC", "true");
    vi.stubEnv("AUTH_SECRET", "a-long-test-secret-for-workflow-actions");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("creates explicitly approved work with its destination and evidence", async () => {
    const response = await POST(await request("seo_analyst"));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ item: { decision: "approved", status: "approved", executionType: "technical_task", targetUrl: "https://mortgagecompare.ae/mortgages", sourceEvidence: { kind: "technical_issue" } } });
  });

  it("blocks viewers from creating site work", async () => {
    const response = await POST(await request("viewer"));
    expect(response.status).toBe(403);
  });
});
