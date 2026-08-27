import { describe, expect, it } from "vitest";
import { qualifyLinkProspect } from "./link-outreach";

describe("link prospect qualification", () => {
  it("marks evidence-backed prospects as strong", () => {
    const result = qualifyLinkProspect({ relevance: 74, authority: 45, competitorHosts: ["one.example", "two.example"], contacts: [{ type: "email", value: "editor@example.test" }] });
    expect(result.quality).toMatchObject({ state: "strong", eligible: true });
    expect(result.contactState).toBe("email_found");
  });

  it("keeps weak prospects out of outreach", () => {
    const result = qualifyLinkProspect({ relevance: 52, authority: 12, competitorHosts: [] });
    expect(result.quality.state).toBe("review");
    expect(result.quality.eligible).toBe(false);
    expect(result.quality.reasons).toHaveLength(3);
  });
});
