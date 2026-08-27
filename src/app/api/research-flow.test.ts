import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as runDomainResearch } from "./domain-research/route";
import { POST as mapResearch, PATCH as reviewMapping } from "./research-mappings/route";
import { createSessionToken, SESSION_COOKIE, type AppRole } from "@/lib/auth";

async function request(path: string, role: AppRole, body: unknown, groupIds: string[] = []) {
  const token = await createSessionToken({ email: `${role}@orwell.test`, name: role, role, groupIds, siteIds: [], allAccess: false, grants: [] }, process.env.AUTH_SECRET!);
  return new Request(`https://orwell.test${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify(body) });
}

describe("global research to website handoff", () => {
  const executionDetails = { executionType: "content_brief", pageMode: "new_page", plannedUrl: "/guides/competitor-opportunity", targetKeywords: ["competitor opportunity"], ownerEmail: "seo_analyst@orwell.test", dueDate: "2026-09-10" } as const;
  beforeAll(() => {
    vi.stubEnv("QA_SYNTHETIC", "true");
    vi.stubEnv("AUTH_SECRET", "a-long-test-secret");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("runs global domain research without a website and without a provider call in QA", async () => {
    const providerFetch = vi.spyOn(globalThis, "fetch");
    const response = await runDomainResearch(await request("/api/domain-research", "seo_analyst", { targetHost: "market-leader.example", locationCode: 2826, languageCode: "en", locationLabel: "United Kingdom" }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ evidence: { kind: "domain", sourceValue: "market-leader.example", locationCode: 2826, provider: "dataforseo" }, synthetic: true });
    expect(providerFetch).not.toHaveBeenCalled();
    providerFetch.mockRestore();
  });

  it("keeps mapping and approval as separate permissioned decisions", async () => {
    const mappingResponse = await mapResearch(await request("/api/research-mappings", "seo_analyst", { evidenceId: "71000000-0000-4000-8000-000000000001", siteSlug: "mortgagecompare", title: "Review a competitor content opportunity", notes: "Strong commercial keyword overlap.", priorityScore: 80, ...executionDetails }));
    expect(mappingResponse.status).toBe(201);
    const mapping = await mappingResponse.json() as { mapping: { id: string; status: string } };
    expect(mapping.mapping.status).toBe("mapped");

    const blocked = await reviewMapping(await request("/api/research-mappings", "manager", { id: mapping.mapping.id, action: "approve" }));
    expect(blocked.status).toBe(403);

    const approved = await reviewMapping(await request("/api/research-mappings", "seo_analyst", { id: mapping.mapping.id, action: "approve" }));
    expect(approved.status).toBe(200);
    await expect(approved.json()).resolves.toMatchObject({ mapping: { status: "approved" } });
  });

  it("blocks viewers from running paid research or mapping evidence", async () => {
    const research = await runDomainResearch(await request("/api/domain-research", "viewer", { targetHost: "competitor.example", locationCode: 2784, languageCode: "en", locationLabel: "United Arab Emirates" }));
    const mapping = await mapResearch(await request("/api/research-mappings", "viewer", { evidenceId: "71000000-0000-4000-8000-000000000001", siteSlug: "mortgagecompare", title: "Blocked mapping", priorityScore: 50, ...executionDetails }));
    expect([research.status, mapping.status]).toEqual([403, 403]);
  });
});
