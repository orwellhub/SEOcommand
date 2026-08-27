import { describe, expect, it } from "vitest";
import { qaDomainBundle, QA_SITES } from "./qa-fixtures";

describe("synthetic QA domain fixtures", () => {
  it.each(QA_SITES.map((site) => [site.id]))("matches the overview read model for %s", (siteId) => {
    const bundle = qaDomainBundle(siteId);
    const totals = bundle.datasets.gsc_totals?.data;
    const pages = bundle.datasets.gsc_pages?.data ?? [];
    const landingPages = bundle.datasets.ga4_landing_pages?.data ?? [];
    const market = bundle.datasets.share_of_market?.data;

    expect(totals?.position).toEqual(expect.any(Number));
    expect(pages.every((page) => Number.isFinite(page.position))).toBe(true);
    expect(landingPages.every((page) => Boolean(page.landingPage))).toBe(true);
    expect(market).toMatchObject({
      site: expect.any(String),
      windowDays: expect.any(Number),
      measuredClicks: expect.any(Number),
      availableClicksInWindow: expect.any(Number),
      shareOfAvailableClicksPct: expect.any(Number),
      impressionShareOfDemandPct: expect.any(Number),
    });
  });
});
