import { describe, expect, it } from "vitest";
import { classifyRobotsAccess } from "./ai-crawler-audit";

describe("AI crawler robots.txt audit", () => {
  it("uses a bot-specific group instead of a conflicting wildcard", () => {
    const robots = `User-agent: *\nDisallow: /\nUser-agent: OAI-SearchBot\nAllow: /`;
    expect(classifyRobotsAccess(robots, "OAI-SearchBot").access).toBe("allowed");
    expect(classifyRobotsAccess(robots, "ClaudeBot").access).toBe("blocked");
  });

  it("reports partial path restrictions without calling root blocked", () => {
    const robots = `User-agent: GPTBot\nDisallow: /private/\nDisallow: /drafts/`;
    const result = classifyRobotsAccess(robots, "GPTBot");
    expect(result.access).toBe("allowed");
    expect(result.evidence).toContain("2 path rules");
  });
});
