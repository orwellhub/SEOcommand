import { describe, expect, it } from "vitest";
import { spendCategoryForEndpoint } from "./spend-approval";

describe("per-site spend categories", () => {
  it.each([
    ["serpOrganicLive", "rankings"],
    ["onPageTaskPost", "crawling"],
    ["backlinksHistory", "backlinks"],
    ["labsCompetitorsDomain", "competitors"],
    ["aiLlmResponses", "ai"],
    ["serpGoogleMapsLiveAdvanced", "local_seo"],
  ])("maps %s to %s", (endpoint, category) => {
    expect(spendCategoryForEndpoint(endpoint)).toBe(category);
  });

  it("leaves new endpoints under the overall site ceiling until categorised", () => {
    expect(spendCategoryForEndpoint("unknownFutureEndpoint")).toBeNull();
  });
});
