import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { TOOLKITS, currentToolkit, TOOLKIT_FEATURES } from "./toolkits";
import { activeNavigationItem, navigationHref } from "./nav";
import { switchScopeHref } from "./site-context";

describe("toolkit navigation", () => {
  it("routes every named tool to an existing screen", () => {
    for (const entry of TOOLKIT_FEATURES) {
      const path = new URL(entry.href, "https://local.test").pathname;
      expect(existsSync(`src/app/(app)${path}/page.tsx`), entry.href).toBe(true);
    }
  });
  it("keeps the exact view and selected website across toolkit navigation and website switches", () => {
    for (const entry of TOOLKIT_FEATURES.filter((item) => !["/sites", "/settings", "/portfolio?scope=portfolio", "/research?workspace=global"].includes(item.href))) {
      const url = new URL(navigationHref(entry, "first-site", "90d"), "https://local.test");
      expect(url.searchParams.get("site"), entry.href).toBe("first-site");
      const switched = new URL(switchScopeHref(url.pathname, url.searchParams, "second-site"), "https://local.test");
      expect(switched.searchParams.get("site")).toBe("second-site");
      expect(switched.searchParams.get("view")).toBe(url.searchParams.get("view"));
      expect(switched.searchParams.get("feature")).toBe(url.searchParams.get("feature"));
    }
  });
  it("selects one exact tool and keeps the right toolkit after a reload", () => {
    const cases = [["/backlinks?view=referring", "seo", "Referring Domains"], ["/local-seo?view=grid", "local", "Map Rank Tracker"], ["/ai-visibility?view=prompts", "ai", "Prompt Tracking"], ["/traffic-analytics?view=channels", "traffic", "Traffic Channels"], ["/content?view=calendar", "content", "Content Calendar"], ["/portfolio?scope=portfolio", "home", "Portfolio overview"]];
    for (const [href, id, label] of cases) {
      const url = new URL(href, "https://local.test");
      const kit = currentToolkit(url.pathname, url.searchParams);
      expect(kit.id).toBe(id);
      expect(activeNavigationItem(kit.groups.flatMap((group) => group.items), url.pathname, url.searchParams)?.label).toBe(label);
    }
    expect(TOOLKITS.map((kit) => kit.id)).toEqual(["home","seo","ai","traffic","local","content","reports","tasks"]);
  });
});
