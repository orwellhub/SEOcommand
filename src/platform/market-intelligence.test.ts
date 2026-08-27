import { describe, expect, it } from "vitest";
import {
  buildContentExplorer,
  buildForecasts,
  buildLinkResearch,
  buildOpportunityQueue,
  buildShareOfVoice,
} from "./market-intelligence";
describe("market intelligence", () => {
  it("detects newcomers and share movement", () => {
    const base = {
      keyword: "x",
      position: 5,
      intent: "commercial",
      device: "desktop",
      tags: ["loans"],
      targetUrl: "/x",
      locationCode: 1,
    };
    const r = buildShareOfVoice([
      {
        ...base,
        capturedOn: "2026-01-01",
        competitors: [{ host: "old.com", position: 1, url: null }],
      },
      {
        ...base,
        capturedOn: "2026-01-02",
        position: 3,
        competitors: [{ host: "new.com", position: 1, url: null }],
      },
    ]);
    expect(r.newcomers[0]?.host).toBe("new.com");
  });
  it("gates forecasts below three outcomes", () => {
    expect(
      buildForecasts([
        {
          domainSlug: "x",
          executionType: "refresh",
          status: "done",
          verification: { outcome: "won" },
        },
      ])[0]?.eligible,
    ).not.toBe(true);
  });
  it("does not coerce missing competitor metrics to zero", () => {
    const result = buildContentExplorer([
      {
        targetHost: "example.com",
        capturedAt: "2026-01-01",
        overview: { organicTraffic: null },
        pages: [{ url: "/a", traffic: null }],
        keywords: [{ keyword: "missing", position: null }],
        backlinks: {},
      },
    ]);
    expect(result[0]?.organicTraffic).toBeNull();
    expect(result[0]?.contentGaps).toEqual([]);
  });
  it("uses the persisted discovered status in outreach counts", () => {
    const links = buildLinkResearch(
      [
        {
          id: "p1",
          sourceDomain: "a.test",
          status: "discovered",
          reason: "gap",
        },
      ],
      [],
    );
    expect(links.crm.discovered).toBe(1);
  });
  it("creates a value-ranked, explainable opportunity queue", () => {
    const queue = buildOpportunityQueue({
      shareOfVoice: {
        latestDate: "",
        leaders: [],
        segments: [],
        newcomers: [],
        winners: [],
        losers: [],
      },
      content: [],
      links: {
        intersect: [
          {
            id: "p1",
            sourceDomain: "authority.test",
            status: "discovered",
            relevance: 91,
            reason: "Links to two competitors",
          },
        ],
        unlinkedMentions: [],
        brokenOpportunities: [],
        newLinks: [],
        crm: { discovered: 1, drafted: 0, contacted: 0 },
      },
      coverage: {
        markets: ["1"],
        services: ["loans"],
        cells: [
          {
            service: "loans",
            market: "1",
            state: "missing",
            bestPosition: null,
            demand: 5000,
            targetUrl: null,
          },
        ],
      },
      ai: { opportunities: [], sources: [] },
    });
    expect(queue[0]).toMatchObject({
      lens: "links",
      score: 91,
      confidence: "medium",
    });
    expect(queue.every((item) => item.evidence)).toBe(true);
  });
});
