import { describe, expect, it } from "vitest";
import { GET as getCompetitorExplorer } from "./competitor-explorer/route";
import { GET as getKeywordStrategy } from "./keyword-strategy/route";
import { GET as getLinkBuilding } from "./link-building/route";
import { GET as getBrowserCrawl } from "./technical/browser-crawl/route";

describe("site-scoped API context", () => {
  it("rejects missing website identifiers instead of substituting a pilot site", async () => {
    const handlers = [getCompetitorExplorer, getKeywordStrategy, getLinkBuilding, getBrowserCrawl];
    const responses = await Promise.all(handlers.map((handler) => handler(new Request("https://orwell.test/api/tool"))));
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
    for (const response of responses) {
      await expect(response.json()).resolves.toMatchObject({ error: "Choose a website first." });
    }
  });
});
