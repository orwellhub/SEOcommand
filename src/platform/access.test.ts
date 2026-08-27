import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accessGrants, accessibleSiteSlugs, canAccessSite, grantedGroupIds, hasPermission } from "./access";
import { QA_GROUPS, QA_SITES } from "@/data/qa-fixtures";
import { createSessionToken, SESSION_COOKIE, type AppRole } from "@/lib/auth";

async function request(role: AppRole, groupIds: string[] = []) {
  const token = await createSessionToken({ email: `${role}@orwell.test`, name: role, role, groupIds, siteIds: [], allAccess: false, grants: [] }, process.env.AUTH_SECRET!);
  return new Request("https://orwell.test/api", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

async function requestWithGrants(grants: { scopeType: "portfolio" | "group" | "site"; scopeId: string | null; permissions: string[] }[]) {
  const token = await createSessionToken({ email: "viewer@orwell.test", name: "Viewer", role: "viewer", groupIds: [], siteIds: ["site-a"], allAccess: false, grants }, process.env.AUTH_SECRET!);
  return new Request("https://orwell.test/api", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

describe("group-scoped website access", () => {
  beforeAll(() => {
    vi.stubEnv("QA_SYNTHETIC", "true");
    vi.stubEnv("AUTH_SECRET", "a-long-test-secret");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("reads granted groups from the signed session", async () => {
    await expect(grantedGroupIds(await request("viewer", ["group-a", "group-b"]))).resolves.toEqual(["group-a", "group-b"]);
  });

  it("keeps Admin and SEO operator portfolio-wide", async () => {
    await expect(accessibleSiteSlugs(await request("admin"))).resolves.toBeNull();
    await expect(accessibleSiteSlugs(await request("seo_analyst"))).resolves.toBeNull();
    await expect(canAccessSite(await request("admin"), QA_SITES.at(-1)!.id)).resolves.toBe(true);
  });

  it("limits Owners and viewers to granted groups and descendants", async () => {
    const finance = QA_GROUPS.find((group) => group.slug === "finance")!;
    const uae = QA_GROUPS.find((group) => group.slug === "uae")!;
    const owner = await request("manager", [finance.id]);
    const viewer = await request("viewer", [uae.id]);

    const ownerSites = await accessibleSiteSlugs(owner);
    expect(ownerSites).toEqual(expect.arrayContaining(finance.siteSlugs));
    expect(ownerSites).toEqual(expect.arrayContaining(uae.siteSlugs));
    await expect(canAccessSite(owner, uae.siteSlugs[0]!)).resolves.toBe(true);
    await expect(canAccessSite(viewer, QA_SITES.at(-1)!.id)).resolves.toBe(false);
  });

  it("denies restricted roles without a group grant", async () => {
    await expect(accessibleSiteSlugs(await request("manager"))).resolves.toEqual([]);
    await expect(canAccessSite(await request("viewer"), QA_SITES[0]!.id)).resolves.toBe(false);
  });

  it("enforces permission names and site scope independently of the display role", async () => {
    const signedRequest = await requestWithGrants([{ scopeType: "site", scopeId: "site-a", permissions: ["view", "run_scans"] }]);
    await expect(accessGrants(signedRequest)).resolves.toHaveLength(1);
    await expect(hasPermission(signedRequest, "run_scans", "site-a")).resolves.toBe(true);
    await expect(hasPermission(signedRequest, "manage_connectors", "site-a")).resolves.toBe(false);
    await expect(hasPermission(signedRequest, "run_scans", "site-b")).resolves.toBe(false);
  });

  it("keeps legacy Owner permissions compatible when explicit grants are absent", async () => {
    await expect(hasPermission(await request("manager"), "manage_users")).resolves.toBe(true);
    await expect(hasPermission(await request("manager"), "manage_connectors")).resolves.toBe(true);
    await expect(hasPermission(await request("manager"), "manage_content")).resolves.toBe(false);
  });

  it("rejects forged privilege headers without a valid signed session", async () => {
    const forged = new Request("https://orwell.test/api", { headers: { "x-orwell-user-role": "admin", "x-orwell-user-all-access": "true" } });
    await expect(canAccessSite(forged, QA_SITES[0]!.id)).resolves.toBe(false);
    await expect(hasPermission(forged, "manage_users")).resolves.toBe(false);
  });
});
