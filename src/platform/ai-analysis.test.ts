import { describe, expect, it } from "vitest";
import { analyseAiResponse, extractAiCitations, extractFanOutQueries } from "./ai-analysis";

const raw = {
  items: [{
    sections: [{
      type: "text",
      text: "1. Rival One is a popular option.\n2. Orwell Hub is a trusted, recommended specialist.",
      annotations: [
        { title: "Orwell guide", url: "https://orwellhub.com/guide" },
        { title: "Industry report", url: "https://example.org/report" },
      ],
    }],
    fan_out_queries: ["best SEO platform", { query: "SEO reporting tools" }],
  }],
};

describe("AI response evidence analysis", () => {
  it("extracts owned citations without relying on JSON substring checks", () => {
    const citations = extractAiCitations(raw, "orwellhub.com");
    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({ domain: "orwellhub.com", owned: true, position: 1 });
  });

  it("extracts provider fan-out queries", () => {
    expect(extractFanOutQueries(raw)).toEqual(["best SEO platform", "SEO reporting tools"]);
  });

  it("measures mention, position, sentiment and competitor evidence", () => {
    const observation = analyseAiResponse({
      siteSlug: "orwell",
      siteName: "Orwell Hub",
      siteHost: "orwellhub.com",
      prompt: "What is the best SEO platform?",
      topic: "Recommendation",
      platform: "chatgpt",
      modelName: "gpt-test",
      capturedOn: "2026-08-27",
      raw,
      competitors: [{ name: "Rival One", host: "rivalone.com" }],
    });
    expect(observation).toMatchObject({ mentioned: true, cited: true, recommendationPosition: 2, sentiment: "positive" });
    expect(observation.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Orwell Hub", owned: true, position: 2 }),
      expect.objectContaining({ name: "Rival One", owned: false, position: 1 }),
    ]));
  });
});
