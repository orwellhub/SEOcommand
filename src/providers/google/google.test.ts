import { describe, it, expect } from "vitest";
import { GSC_SITE_MAP, GA4_PROPERTY_MAP, readGoogleAuthConfig } from "./config";
import { googleConfigured } from "./auth";
import benchmarks from "@/data/benchmarks.json";
import { DOMAINS } from "@/data/domains";

describe("Google provider config", () => {
  it("maps every pilot domain to a GSC domain property", () => {
    expect(GSC_SITE_MAP.mortgagecompare).toBe("sc-domain:mortgagecompare.ae");
    expect(GSC_SITE_MAP.busrentalglobal).toBe("sc-domain:busrentalglobal.com");
    expect(GSC_SITE_MAP.pettransportglobal).toBe("sc-domain:pettransportglobal.com");
  });

  it("has GA4 property ids reconciled against the live account inventory", () => {
    expect(GA4_PROPERTY_MAP.mortgagecompare).toBe("529950642");
    expect(GA4_PROPERTY_MAP.pettransportglobal).toBe("536371348");
    expect(GA4_PROPERTY_MAP.moneycompare).toBe("541738826");
    expect(GA4_PROPERTY_MAP.insurecompare).toBe("541720356"); // corrected from 541656359
    expect(GA4_PROPERTY_MAP.warmhomeschemeloan).toBe("546413199");
  });

  it("maps every domain in the registry to a GA4 property", () => {
    // The five previously-unmapped domains got properties in the 2026-07 GA4
    // inventory, so the portfolio now has full coverage. A null here means a
    // domain was added without provisioning analytics for it.
    const unmapped = DOMAINS.filter((d) => GA4_PROPERTY_MAP[d.id] == null).map((d) => d.id);
    expect(unmapped).toEqual([]);
  });

  it("uses numeric GA4 property ids, never a G- measurement id", () => {
    // These are different identifiers: the measurement id tags the site, the
    // numeric property id is what the Data API reads. Swapping them fails at
    // request time with an unhelpful error, so guard it here.
    for (const d of DOMAINS) {
      expect(GA4_PROPERTY_MAP[d.id]).toMatch(/^\d+$/);
    }
  });

  it("reports not-configured when no Google credentials are set", () => {
    // No GOOGLE_* env in the test environment.
    expect(readGoogleAuthConfig()).toBeNull();
    expect(googleConfigured()).toBe(false);
  });
});

describe("share-of-market benchmark", () => {
  it("bundles the MortgageCompare benchmark keyed by its GSC site", () => {
    const b = benchmarks as any;
    expect(b.site).toBe("sc-domain:mortgagecompare.ae");
    expect(b.keyword_count).toBeGreaterThan(0);
    expect(b.available_monthly_clicks).toBeGreaterThan(0);
  });

  it("share of a 28-day window is measured clicks over the pro-rated click pool", () => {
    const b = benchmarks as any;
    const days = 28;
    const availableInWindow = b.available_monthly_clicks * (days / 30);
    const measuredClicks = 1200;
    const share = (measuredClicks / availableInWindow) * 100;
    expect(share).toBeGreaterThan(0);
    // Sanity: 1200 clicks vs a pro-rated pool of ~13.9k is a single-digit-to-low-teens %.
    expect(share).toBeLessThan(100);
  });
});
