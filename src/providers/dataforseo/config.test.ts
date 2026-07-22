import { afterEach, describe, expect, it } from "vitest";
import { locationFor } from "./config";

describe("DataForSEO location configuration", () => {
  afterEach(() => {
    delete process.env.DATAFORSEO_LOCATION_BUSRENTALGLOBAL;
    delete process.env.DATAFORSEO_LANGUAGE_BUSRENTALGLOBAL;
  });

  it("uses explicit registry locations", () => {
    expect(locationFor("mortgagecompare")).toEqual({ location_code: 2784, language_code: "en" });
    expect(locationFor("pestremovalusa")).toEqual({ location_code: 2840, language_code: "en" });
  });

  it("does not silently fall back for multi-market domains", () => {
    expect(() => locationFor("busrentalglobal")).toThrow(/DATAFORSEO_LOCATION_BUSRENTALGLOBAL/);
  });

  it("accepts a per-domain location and language override", () => {
    process.env.DATAFORSEO_LOCATION_BUSRENTALGLOBAL = "2276";
    process.env.DATAFORSEO_LANGUAGE_BUSRENTALGLOBAL = "de";
    expect(locationFor("busrentalglobal")).toEqual({ location_code: 2276, language_code: "de" });
  });
});
