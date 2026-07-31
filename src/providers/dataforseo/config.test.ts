import { afterEach, describe, expect, it } from "vitest";
import { locationFor } from "./config";
import { DOMAINS } from "@/data/domains";

describe("DataForSEO location configuration", () => {
  afterEach(() => {
    delete process.env.DATAFORSEO_LOCATION_BUSRENTALGLOBAL;
    delete process.env.DATAFORSEO_LANGUAGE_BUSRENTALGLOBAL;
  });

  it("uses explicit registry locations", () => {
    expect(locationFor("mortgagecompare")).toEqual({ location_code: 2784, language_code: "en" });
    expect(locationFor("pestremovalusa")).toEqual({ location_code: 2840, language_code: "en" });
  });

  it("resolves a location for every domain in the registry", () => {
    // A null location makes locationFor() throw mid-sync, which previously took
    // busrentalglobal and pettransportglobal out of the monthly DataForSEO run.
    // Every domain must resolve without needing an env var present.
    for (const d of DOMAINS) {
      expect(() => locationFor(d.id)).not.toThrow();
    }
  });

  it("still refuses a domain with no configured market", () => {
    // The guard itself must stay intact for any domain added without a market.
    expect(() => locationFor("does-not-exist")).toThrow();
  });

  it("accepts a per-domain location and language override", () => {
    process.env.DATAFORSEO_LOCATION_BUSRENTALGLOBAL = "2276";
    process.env.DATAFORSEO_LANGUAGE_BUSRENTALGLOBAL = "de";
    expect(locationFor("busrentalglobal")).toEqual({ location_code: 2276, language_code: "de" });
  });
});
