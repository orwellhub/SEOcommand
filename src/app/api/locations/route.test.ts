import { describe, expect, it, vi } from "vitest";

vi.mock("@/providers/dataforseo", () => ({
  dataForSeoConfigured: () => false,
  getDataForSeoClient: () => ({ getMeta: vi.fn() }),
}));

import { GET } from "./route";
import { KEYWORD_DATABASES } from "@/lib/markets";

async function get(query: string) {
  return (await GET(new Request(`https://command.test/api/locations${query}`))).json();
}

describe("locations endpoint — keyword catalogue", () => {
  it("serves every Labs keyword database rather than a truncated slice", async () => {
    const body = await get("?catalogue=keywords");
    expect(body.locations).toHaveLength(KEYWORD_DATABASES.length);
    expect(body.total).toBe(KEYWORD_DATABASES.length);
    // The old dropdown stopped at 60 rows of the SERP catalogue, which cut off
    // every database from roughly Ghana onwards.
    expect(body.locations.length).toBeGreaterThan(60);
    const names = body.locations.map((row: { name: string }) => row.name);
    expect(names).toEqual(expect.arrayContaining(["United States", "United Kingdom", "Singapore", "Japan", "Vietnam", "South Africa"]));
  });

  it("keeps databases DataForSEO types as regions rather than countries", async () => {
    const names = (await get("?catalogue=keywords")).locations.map((row: { name: string }) => row.name);
    // Taiwan and Hong Kong are `Region` in the catalogue, so a `type=Country`
    // filter used to drop them even though both are scannable databases.
    expect(names).toContain("Taiwan");
    expect(names).toContain("Hong Kong");
  });

  it("is available without DataForSEO credentials", async () => {
    const body = await get("?catalogue=keywords");
    expect(body.configured).toBe(false);
    expect(body.locations).toHaveLength(KEYWORD_DATABASES.length);
    expect(body.version).toMatch(/^\d{4}_\d{2}_\d{2}$/);
  });

  it("reports each database's real scan languages, not a blanket English default", async () => {
    const rows = (await get("?catalogue=keywords")).locations as { name: string; language: string; languages: { code: string }[] }[];
    const germany = rows.find((row) => row.name === "Germany");
    expect(germany?.language).toBe("de");
    const algeria = rows.find((row) => row.name === "Algeria");
    expect(algeria?.languages.map((language) => language.code)).toEqual(["fr", "ar"]);
    const uae = rows.find((row) => row.name === "United Arab Emirates");
    // A curated priority market keeps the language the portfolio scans it in.
    expect(uae?.language).toBe("en");
  });

  it("searches the catalogue by name and ISO code", async () => {
    expect((await get("?catalogue=keywords&q=viet")).locations.map((row: { name: string }) => row.name)).toEqual(["Vietnam"]);
    expect((await get("?catalogue=keywords&q=za")).locations.map((row: { name: string }) => row.name)).toContain("South Africa");
  });

  it("still honours an explicit limit without imposing one by default", async () => {
    expect((await get("?catalogue=keywords&limit=5")).locations).toHaveLength(5);
    expect((await get("?catalogue=keywords&limit=5")).total).toBe(KEYWORD_DATABASES.length);
  });
});

describe("locations endpoint — SERP catalogue", () => {
  it("keeps serving the broader location list for city-level selectors", async () => {
    const body = await get("?q=united&limit=30");
    expect(body.ok).toBe(true);
    expect(body.locations.map((row: { name: string }) => row.name)).toEqual(expect.arrayContaining(["United Arab Emirates", "United Kingdom", "United States"]));
    expect(body.catalogue).toBeUndefined();
  });
});
