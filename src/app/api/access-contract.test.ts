import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getActionCentre } from "./action-centre/route";
import { GET as getAiVisibility } from "./ai-visibility/route";
import { POST as createAiPrompt } from "./ai-prompts/route";
import { POST as exploreCompetitor } from "./competitor-explorer/route";
import { POST as refreshKeywordStrategy } from "./keyword-strategy/route";
import { POST as discoverLinks } from "./link-building/route";
import { GET as getLocalSeo } from "./local-seo/route";
import { GET as getMonitoring } from "./monitoring/route";
import { GET as getNotifications, PATCH as patchNotification } from "./notifications/route";
import { POST as createGroup } from "./portfolio-groups/route";
import { POST as approveSite } from "./sites/[siteId]/approval/route";
import { GET as getSiteSettings, PATCH as patchSiteSettings } from "./sites/[siteId]/settings/route";
import { POST as queueBrowserCrawl } from "./technical/browser-crawl/route";
import { GET as getWorkflowTasks, POST as createWorkflowTask } from "./workflow/tasks/route";
import { QA_GROUPS } from "@/data/qa-fixtures";
import { resolveGroupSiteSlugs } from "@/platform/site-store";

const FINANCE = QA_GROUPS.find((group) => group.slug === "finance")!;
const LAUNCHES = QA_GROUPS.find((group) => group.slug === "launches")!;

function request(
  path: string,
  role: string,
  groupIds: string[] = [],
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-orwell-user-role", role);
  headers.set("x-orwell-user-email", `${role}@orwell.test`);
  headers.set("x-orwell-user-groups", groupIds.join(","));
  return new Request(`https://orwell.test${path}`, { ...init, headers });
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("API access contract", () => {
  beforeAll(() => vi.stubEnv("QA_SYNTHETIC", "true"));
  afterAll(() => vi.unstubAllEnvs());

  it("preserves group scope across Action Centre, notifications and analytical dashboards", async () => {
    const financeSites = new Set(await resolveGroupSiteSlugs(FINANCE.id));
    const headers = [FINANCE.id];

    const actionResponse = await getActionCentre(request("/api/action-centre", "manager", headers));
    const action = await json(actionResponse) as { items: Array<{ siteSlug: string }> };
    expect(action.items.length).toBeGreaterThan(0);
    expect(action.items.every((item) => financeSites.has(item.siteSlug))).toBe(true);

    const notificationResponse = await getNotifications(request("/api/notifications", "manager", headers));
    const notifications = await json(notificationResponse) as { items: Array<{ siteSlug: string }> };
    expect(notifications.items.every((item) => financeSites.has(item.siteSlug))).toBe(true);

    const [aiResponse, monitoringResponse, localResponse] = await Promise.all([
      getAiVisibility(request("/api/ai-visibility?scope=portfolio", "manager", headers)),
      getMonitoring(request("/api/monitoring?scope=portfolio", "manager", headers)),
      getLocalSeo(request("/api/local-seo?scope=portfolio", "manager", headers)),
    ]);
    const ai = await json(aiResponse) as { scope: { siteSlugs: string[] } };
    const monitoring = await json(monitoringResponse) as { latest: Array<{ siteSlug: string }> };
    const local = await json(localResponse) as { locations: Array<{ siteSlug: string }> };
    expect(ai.scope.siteSlugs.every((siteSlug) => financeSites.has(siteSlug))).toBe(true);
    expect(monitoring.latest.every((item) => financeSites.has(item.siteSlug))).toBe(true);
    expect(local.locations.every((item) => financeSites.has(item.siteSlug))).toBe(true);
  });

  it("lets an Owner read and approve an assigned site but not edit operational settings", async () => {
    const params = { params: Promise.resolve({ siteId: "mortgagecompare" }) };
    const getResponse = await getSiteSettings(request("/api/sites/mortgagecompare/settings", "manager", [FINANCE.id]), params);
    expect(getResponse.status).toBe(200);

    const workflowResponse = await getWorkflowTasks(request("/api/workflow/tasks?domain=mortgagecompare", "manager", [FINANCE.id]));
    expect(workflowResponse.status).toBe(200);
    expect(await json(workflowResponse)).toMatchObject({ synthetic: true });

    const approvalResponse = await approveSite(request("/api/sites/mortgagecompare/approval", "manager", [FINANCE.id], {
      method: "POST",
      body: JSON.stringify({ action: "approve", approvedMonthlyUsd: 10 }),
    }), params);
    expect(approvalResponse.status).toBe(200);

    const editResponse = await patchSiteSettings(request("/api/sites/mortgagecompare/settings", "manager", [FINANCE.id], {
      method: "PATCH",
      body: JSON.stringify({
        section: "general",
        name: "MortgageCompare",
        host: "mortgagecompare.ae",
        industry: "Mortgage comparison",
        primaryMarket: "United Arab Emirates",
        locationCode: 2784,
        languageCode: "en",
        devices: ["desktop"],
        lifecycleStatus: "active",
        accent: "#335cff",
      }),
    }), params);
    expect(editResponse.status).toBe(403);
  });

  it("blocks out-of-scope Owners and viewers", async () => {
    const params = { params: Promise.resolve({ siteId: "mortgagecompare" }) };
    const owner = request("/api/sites/mortgagecompare/settings", "manager", [LAUNCHES.id]);
    const viewer = request("/api/sites/mortgagecompare/settings", "viewer", [LAUNCHES.id]);
    expect((await getSiteSettings(owner, params)).status).toBe(403);
    expect((await getSiteSettings(viewer, params)).status).toBe(403);
  });

  it("applies write checks before every synthetic success path", async () => {
    const viewerGroups = [FINANCE.id];
    const calls = [
      createGroup(request("/api/portfolio-groups", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ name: "Blocked group" }) })),
      queueBrowserCrawl(request("/api/technical/browser-crawl", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ siteSlug: "mortgagecompare", maxPages: 20 }) })),
      exploreCompetitor(request("/api/competitor-explorer", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ siteSlug: "mortgagecompare", targetHost: "competitor.test" }) })),
      refreshKeywordStrategy(request("/api/keyword-strategy", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ siteSlug: "mortgagecompare" }) })),
      discoverLinks(request("/api/link-building", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ siteSlug: "mortgagecompare", competitors: ["competitor.test"] }) })),
      createAiPrompt(request("/api/ai-prompts", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ siteSlug: "mortgagecompare", prompt: "Which mortgage provider is best?", topic: "Comparison", platforms: ["chatgpt"] }) })),
      patchNotification(request("/api/notifications", "viewer", viewerGroups, { method: "PATCH", body: JSON.stringify({ id: "20000000-0000-4000-8000-000000000001", action: "resolve" }) })),
      createWorkflowTask(request("/api/workflow/tasks", "viewer", viewerGroups, { method: "POST", body: JSON.stringify({ domainId: "mortgagecompare", action: "approve", recommendation: { id: "qa-rec", title: "Blocked recommendation", module: "Technical", effort: "S", priorityScore: 80 } }) })),
    ];
    const responses = await Promise.all(calls);
    expect(responses.map((response) => response.status)).toEqual(responses.map(() => 403));
  });
});
