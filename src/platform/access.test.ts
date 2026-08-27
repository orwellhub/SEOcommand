import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accessibleSiteSlugs, canAccessSite, grantedGroupIds } from "./access";
import { QA_GROUPS, QA_SITES } from "@/data/qa-fixtures";

function request(role: string, groupIds: string[] = []) {
  return new Request("https://orwell.test/api", {
    headers: {
      "x-orwell-user-role": role,
      "x-orwell-user-groups": groupIds.join(","),
    },
  });
}

describe("group-scoped website access", () => {
  beforeAll(() => vi.stubEnv("QA_SYNTHETIC", "true"));
  afterAll(() => vi.unstubAllEnvs());

  it("normalises granted group headers", () => {
    expect(grantedGroupIds(request("viewer", [" group-a ", "group-b"]))).toEqual(["group-a", "group-b"]);
  });

  it("keeps Admin and SEO operator portfolio-wide", async () => {
    await expect(accessibleSiteSlugs(request("admin"))).resolves.toBeNull();
    await expect(accessibleSiteSlugs(request("seo_analyst"))).resolves.toBeNull();
    await expect(canAccessSite(request("admin"), QA_SITES.at(-1)!.id)).resolves.toBe(true);
  });

  it("limits Owners and viewers to granted groups and descendants", async () => {
    const finance = QA_GROUPS.find((group) => group.slug === "finance")!;
    const uae = QA_GROUPS.find((group) => group.slug === "uae")!;
    const owner = request("manager", [finance.id]);
    const viewer = request("viewer", [uae.id]);

    const ownerSites = await accessibleSiteSlugs(owner);
    expect(ownerSites).toEqual(expect.arrayContaining(finance.siteSlugs));
    expect(ownerSites).toEqual(expect.arrayContaining(uae.siteSlugs));
    await expect(canAccessSite(owner, uae.siteSlugs[0]!)).resolves.toBe(true);
    await expect(canAccessSite(viewer, QA_SITES.at(-1)!.id)).resolves.toBe(false);
  });

  it("denies restricted roles without a group grant", async () => {
    await expect(accessibleSiteSlugs(request("manager"))).resolves.toEqual([]);
    await expect(canAccessSite(request("viewer"), QA_SITES[0]!.id)).resolves.toBe(false);
  });
});
