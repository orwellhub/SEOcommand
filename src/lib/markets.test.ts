import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKET,
  KEYWORD_DATABASES,
  defaultLanguageForMarket,
  isKeywordDatabase,
  keywordDatabaseLanguages,
  marketForIsoCountry,
  marketLabel,
} from "./markets";

describe("keyword database catalogue", () => {
  it("carries the full published Labs catalogue with unique codes", () => {
    expect(KEYWORD_DATABASES.length).toBeGreaterThanOrEqual(94);
    expect(new Set(KEYWORD_DATABASES.map((database) => database.code)).size).toBe(KEYWORD_DATABASES.length);
    expect(KEYWORD_DATABASES.every((database) => database.languages.length > 0)).toBe(true);
  });

  it("is sorted by name so the tool's dropdown reads alphabetically", () => {
    const names = KEYWORD_DATABASES.map((database) => database.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("accepts supported databases and rejects other locations", () => {
    expect(isKeywordDatabase(2840)).toBe(true);
    expect(isKeywordDatabase(2158)).toBe(true); // Taiwan, typed as a region
    expect(isKeywordDatabase(2344)).toBe(true); // Hong Kong, typed as a region
    expect(isKeywordDatabase(1028745)).toBe(false); // a city, not a database
    expect(isKeywordDatabase(2643)).toBe(false); // Russia is not a Labs database
  });

  it("labels codes from the catalogue and falls back for unknown locations", () => {
    expect(marketLabel(DEFAULT_MARKET.code)).toBe("United Arab Emirates");
    expect(marketLabel(2392)).toBe("Japan");
    expect(marketLabel(999999)).toBe("Location 999999");
  });
});

describe("scan language defaults", () => {
  it("defaults a database to a language DataForSEO actually indexes it in", () => {
    expect(defaultLanguageForMarket(2276)).toBe("de"); // Germany
    expect(defaultLanguageForMarket(2392)).toBe("ja"); // Japan
    expect(defaultLanguageForMarket(2076)).toBe("pt"); // Brazil
  });

  it("keeps a requested language when the database supports it", () => {
    expect(defaultLanguageForMarket(2124, "fr")).toBe("fr"); // Canada
    expect(defaultLanguageForMarket(2124, "en")).toBe("en");
  });

  it("replaces a language the database cannot be scanned in", () => {
    expect(defaultLanguageForMarket(2392, "en")).toBe("ja");
    expect(keywordDatabaseLanguages(2392).map((language) => language.code)).not.toContain("en");
  });

  it("prefers the curated market language where it is supported", () => {
    expect(defaultLanguageForMarket(DEFAULT_MARKET.code)).toBe("en");
  });

  it("leaves unsupported locations to the caller's language", () => {
    expect(defaultLanguageForMarket(999999, "es")).toBe("es");
    expect(defaultLanguageForMarket(999999)).toBe("en");
  });
});

describe("clickstream country resolution", () => {
  it("resolves countries by ISO code, including ones whose names differ", () => {
    expect(marketForIsoCountry("us")).toEqual({ code: 2840, label: "United States" });
    expect(marketForIsoCountry("TR")?.label).toBe("Turkiye");
    expect(marketForIsoCountry("CZ")?.label).toBe("Czechia");
    expect(marketForIsoCountry("KR")?.label).toBe("South Korea");
    expect(marketForIsoCountry("VN")?.label).toBe("Vietnam");
  });

  it("returns nothing for countries with no keyword database", () => {
    expect(marketForIsoCountry("RU")).toBeNull();
    expect(marketForIsoCountry("ZZ")).toBeNull();
  });
});
