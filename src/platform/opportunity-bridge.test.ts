import { describe, expect, it } from "vitest";
import { analyseOpportunityDuplicates } from "./opportunity-bridge";

describe("analyseOpportunityDuplicates", () => {
  it("returns a clear result when stored website evidence has no overlap", () => {
    const result = analyseOpportunityDuplicates(
      { targetKeywords: ["enterprise seo"], plannedUrl: "/enterprise-seo" },
      [{ page: "https://example.com/local-seo", primaryQuery: "local seo", queries: ["local seo services"] }],
      [],
    );
    expect(result).toMatchObject({ severity: "none", matches: [] });
  });

  it("flags keyword mapping and known cannibalisation before approval", () => {
    const result = analyseOpportunityDuplicates(
      { targetKeywords: ["technical seo audit"], targetUrl: "https://example.com/new-audit" },
      [{ page: "https://example.com/seo-audit", primaryQuery: "technical seo audit", queries: ["seo audit"] }],
      [{ query: "technical seo audit", pages: [{ page: "https://example.com/seo-audit" }, { page: "https://example.com/audit-guide" }] }],
    );
    expect(result.severity).toBe("warning");
    expect(result.matches.map((match) => match.kind)).toEqual(expect.arrayContaining(["keyword", "cannibalisation"]));
  });

  it("normalises destination URLs and includes duplicate execution work", () => {
    const result = analyseOpportunityDuplicates(
      { targetKeywords: [], targetUrl: "https://example.com/guides/seo/" },
      [{ page: "https://example.com/guides/seo", primaryQuery: "seo guide", queries: [] }],
      [],
      [{ title: "Existing SEO guide refresh", targetUrl: "https://example.com/guides/seo/", plannedUrl: null }],
    );
    expect(result.matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "url" }),
      expect.objectContaining({ kind: "work", label: "Existing SEO guide refresh" }),
    ]));
  });
});
