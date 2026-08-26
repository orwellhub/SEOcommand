import { describe, expect, it } from "vitest";
import type { BrowserCrawlPageInput } from "./advanced-crawler";
import { applyCrossPageChecks, cleanUrl, publicHost } from "./advanced-crawler";
import { cleanCompetitorHost } from "./competitive-intelligence";
import { buildLocalGridPoints } from "./local-seo";
import { isPublicAddress, isObviouslyPublicHostname } from "./public-network";

function page(url: string, title: string, contentHash: string): BrowserCrawlPageInput {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    depth: 1,
    rawTitle: title,
    renderedTitle: title,
    description: "Description",
    canonical: url,
    h1Count: 1,
    wordCount: 100,
    rawHash: contentHash,
    renderedHash: contentHash,
    jsDependent: false,
    indexable: true,
    schemaTypes: [],
    hreflang: {},
    internalLinks: 0,
    externalLinks: 0,
    loadTimeMs: 100,
    issues: [],
    links: [],
  };
}

describe("operations intelligence guards", () => {
  it("normalises tracking URLs and blocks local or private crawl hosts", () => {
    expect(cleanUrl("/pricing?utm_source=test&plan=pro#details", "https://example.com/about")).toBe("https://example.com/pricing?plan=pro");
    expect(publicHost("example.com")).toBe(true);
    expect(publicHost("localhost")).toBe(false);
    expect(publicHost("192.168.1.10")).toBe(false);
    expect(publicHost("172.20.1.4")).toBe(false);
    expect(isPublicAddress("100.64.1.1")).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isObviouslyPublicHostname("service.internal")).toBe(false);
  });

  it("finds duplicate metadata, duplicate rendered content and orphan pages", () => {
    const home = page("https://example.com/", "Home", "home");
    const first = page("https://example.com/a", "Repeated", "same");
    const second = page("https://example.com/b", "Repeated", "same");
    home.links.push({ targetUrl: first.url, anchor: "A", nofollow: false });

    applyCrossPageChecks([home, first, second]);

    expect(first.issues).toEqual(expect.arrayContaining(["duplicate_title", "duplicate_rendered_content"]));
    expect(first.issues).not.toContain("orphan_from_rendered_graph");
    expect(second.issues).toEqual(expect.arrayContaining(["duplicate_title", "duplicate_rendered_content", "orphan_from_rendered_graph"]));
  });

  it("creates exact 3x3 and 5x5 local ranking grids", () => {
    const three = buildLocalGridPoints(25.2048, 55.2708, 5, 3);
    const five = buildLocalGridPoints(25.2048, 55.2708, 10, 5);
    expect(three).toHaveLength(9);
    expect(five).toHaveLength(25);
    expect(three).toContainEqual({ latitude: 25.2048, longitude: 55.2708 });
  });

  it("accepts competitor URLs but stores only a safe hostname", () => {
    expect(cleanCompetitorHost("https://www.Example.com/blog/post")).toBe("example.com");
    expect(() => cleanCompetitorHost("not a domain")).toThrow("valid competitor domain");
  });
});
