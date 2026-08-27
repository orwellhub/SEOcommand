import { describe, expect, it } from "vitest";
import { buildLinkGapRequest, cleanCompetitorHost, parseLinkGapProspects } from "./competitive-intelligence";

describe("link-gap prospect discovery", () => {
  it("builds a valid numbered Domain Intersection request", () => {
    expect(buildLinkGapRequest("mortgagecompare.co.uk", ["competitor-one.com", "competitor-two.com"])).toEqual({
      targets: { "1": "competitor-one.com", "2": "competitor-two.com" },
      exclude_targets: ["mortgagecompare.co.uk"],
      limit: 500,
      order_by: ["1.rank,desc"],
      rank_scale: "one_hundred",
    });
  });

  it("reads referring-domain evidence from the numbered intersection objects", () => {
    const result = [{
      items: [{
        domain_intersection: {
          "1": { target: "publisher.example", rank: 42, backlinks: 3 },
          "2": { target: "publisher.example", rank: 68, backlinks: 7 },
        },
        summary: { intersections_count: 2 },
      }],
    }];

    expect(parseLinkGapProspects(result, ["competitor-one.com", "competitor-two.com"], "mortgagecompare.co.uk")).toEqual([{
      sourceDomain: "publisher.example",
      authority: 68,
      relevance: 87,
      reason: "Links to 2 selected competitors, but not mortgagecompare.co.uk.",
      competitorHosts: ["competitor-one.com", "competitor-two.com"],
    }]);
  });

  it("keeps only competitors backed by the response evidence", () => {
    const result = [{ items: [{ domain_intersection: { "2": { target: "single.example", rank: 25 } } }] }];

    expect(parseLinkGapProspects(result, ["first.example", "second.example"], "owned.example")[0]).toMatchObject({
      sourceDomain: "single.example",
      competitorHosts: ["second.example"],
      reason: "Links to 1 selected competitor, but not owned.example.",
    });
  });

  it("normalises competitor URLs and rejects invalid domains", () => {
    expect(cleanCompetitorHost("https://www.Example.com/path")).toBe("example.com");
    expect(() => cleanCompetitorHost("not a domain")).toThrow("Enter a valid competitor domain.");
  });
});
