import { describe, expect, it } from "vitest";
import { buildForecasts, buildShareOfVoice } from "./market-intelligence";
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
});
