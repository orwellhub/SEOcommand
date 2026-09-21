import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchPublic } = vi.hoisted(() => ({ fetchPublic: vi.fn() }));
vi.mock("./public-network", () => ({
  fetchPublic,
  readBoundedText: (response: Response) => response.text(),
  assertPublicHostname: vi.fn(),
}));
vi.mock("@/sync/store", () => ({ hasDatabase: () => false }));

import {
  aiAccessSeverity,
  aiAccessTransitions,
  allowsTraining,
  auditAiCrawlerAccess,
  classifyRobotsAccess,
  evaluateBot,
} from "./ai-crawler-audit";
import type { ManagedSite } from "./types";

const site = { id: "example", name: "Example", host: "example.test", siteSettings: {} } as unknown as ManagedSite;
const robotsResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain" } });

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

describe("per-bot evaluation", () => {
  const entry = { bot: "OAI-SearchBot", category: "search" as const };
  const url = "https://example.test/robots.txt";

  it("reports allowed when neither the root nor a sampled path is disallowed", () => {
    const row = evaluateBot("User-agent: *\nDisallow: /admin/", entry, ["/a", "/b"], url, 200);
    expect(row.access).toBe("allowed");
    expect(row.checkedPages).toBe(3);
    expect(row.blockedPages).toBe(0);
  });

  it("reports partial when the root is reachable but a sampled path is not", () => {
    const row = evaluateBot("User-agent: *\nDisallow: /blog/", entry, ["/blog/one", "/blog/two", "/about"], url, 200);
    expect(row.access).toBe("partial");
    expect(row.blockedPages).toBe(2);
    expect(row.checkedPages).toBe(4);
    expect(row.details.samples).toEqual(["/blog/one", "/blog/two"]);
    expect(row.details.rule).toBe("/blog/");
    expect(row.evidence).toContain("2 of 3 sampled paths are disallowed");
  });

  it("reports blocked when the root is disallowed and counts every path as blocked", () => {
    const row = evaluateBot("User-agent: *\nDisallow: /", entry, ["/a", "/b"], url, 200);
    expect(row.access).toBe("blocked");
    expect(row.blockedPages).toBe(3);
    expect(row.details.rule).toBe("/");
  });

  it("records that a verdict came from the wildcard group", () => {
    expect(evaluateBot("User-agent: *\nDisallow: /", entry, [], url, 200).details.wildcardGroup).toBe(true);
    expect(evaluateBot("User-agent: OAI-SearchBot\nDisallow: /", entry, [], url, 200).details.wildcardGroup).toBe(false);
  });

  it("carries the governs note for tokens whose scope is misread", () => {
    const row = evaluateBot("", { bot: "Googlebot", category: "search", governs: "AI Overviews and AI Mode" }, [], url, 200);
    expect(row.details.governs).toBe("AI Overviews and AI Mode");
  });
});

describe("severity policy", () => {
  it("treats a blocked retrieval bot as high", () => {
    expect(aiAccessSeverity({ access: "blocked", category: "search" })).toBe("high");
    expect(aiAccessSeverity({ access: "partial", category: "assistant" })).toBe("high");
  });

  it("treats a blocked training bot as a low-severity editorial choice", () => {
    expect(aiAccessSeverity({ access: "blocked", category: "training" })).toBe("low");
  });

  it("raises a blocked training bot when the site opted into training access", () => {
    expect(aiAccessSeverity({ access: "blocked", category: "training" }, true)).toBe("medium");
  });

  it("reports nothing for an allowed bot and medium when the check failed", () => {
    expect(aiAccessSeverity({ access: "allowed", category: "search" })).toBeNull();
    expect(aiAccessSeverity({ access: "unknown", category: "search" })).toBe("medium");
  });

  it("reads the per-site training policy", () => {
    expect(allowsTraining({ siteSettings: {} })).toBe(false);
    expect(allowsTraining({ siteSettings: { aiAccessPolicy: { allowTraining: true } } })).toBe(true);
    expect(allowsTraining({ siteSettings: { aiAccessPolicy: { allowTraining: false } } })).toBe(false);
  });
});

describe("access transitions", () => {
  const current = [
    { bot: "OAI-SearchBot", category: "search" as const, access: "blocked" as const },
    { bot: "ChatGPT-User", category: "assistant" as const, access: "allowed" as const },
    { bot: "GPTBot", category: "training" as const, access: "blocked" as const },
  ];

  it("raises a change when a retrieval bot loses access", () => {
    const changes = aiAccessTransitions([{ bot: "OAI-SearchBot", access: "allowed" }], current);
    expect(changes).toEqual([{ bot: "OAI-SearchBot", category: "search", kind: "blocked" }]);
  });

  it("raises a change when access is restored", () => {
    const changes = aiAccessTransitions([{ bot: "ChatGPT-User", access: "blocked" }], current);
    expect(changes).toEqual([{ bot: "ChatGPT-User", category: "assistant", kind: "restored" }]);
  });

  it("counts a move to partial as losing access", () => {
    const changes = aiAccessTransitions(
      [{ bot: "PerplexityBot", access: "allowed" }],
      [{ bot: "PerplexityBot", category: "search", access: "partial" }],
    );
    expect(changes[0]!.kind).toBe("blocked");
  });

  it("stays silent for training bots, unchanged verdicts and first-ever audits", () => {
    expect(aiAccessTransitions([{ bot: "GPTBot", access: "allowed" }], current)).toEqual([]);
    expect(aiAccessTransitions([{ bot: "OAI-SearchBot", access: "blocked" }], current)).toEqual([]);
    expect(aiAccessTransitions([], current)).toEqual([]);
  });

  it("does not alert on a move between unknown and a verdict", () => {
    expect(aiAccessTransitions(
      [{ bot: "OAI-SearchBot", access: "unknown" }],
      [{ bot: "OAI-SearchBot", category: "search", access: "blocked" }],
    )).toEqual([]);
  });
});

describe("auditAiCrawlerAccess", () => {
  beforeEach(() => { fetchPublic.mockReset(); });

  it("treats a missing robots.txt as unrestricted", async () => {
    fetchPublic.mockResolvedValue(robotsResponse("", 404));
    const rows = await auditAiCrawlerAccess(site);
    expect(rows.every((row) => row.access === "allowed")).toBe(true);
    expect(rows[0]!.robotsStatus).toBe(404);
  });

  it("reports unknown rather than guessing when robots.txt errors", async () => {
    fetchPublic.mockResolvedValue(robotsResponse("upstream failure", 503));
    const rows = await auditAiCrawlerAccess(site);
    expect(rows.every((row) => row.access === "unknown")).toBe(true);
    expect(rows[0]!.evidence).toContain("503");
    expect(rows[0]!.checkedPages).toBeNull();
  });

  it("reports unknown when the request throws", async () => {
    fetchPublic.mockImplementation(async () => { throw new Error("ENOTFOUND"); });
    const rows = await auditAiCrawlerAccess(site);
    expect(rows.every((row) => row.access === "unknown")).toBe(true);
    expect(rows[0]!.evidence).toBe("ENOTFOUND");
  });

  it("audits every token against the supplied paths", async () => {
    fetchPublic.mockResolvedValue(robotsResponse("User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow: /internal/"));
    const rows = await auditAiCrawlerAccess(site, ["/internal/notes", "/public"]);
    expect(rows.length).toBeGreaterThanOrEqual(21);
    expect(rows.find((row) => row.bot === "GPTBot")!.access).toBe("blocked");
    expect(rows.find((row) => row.bot === "Googlebot")!.access).toBe("partial");
    expect(rows.find((row) => row.bot === "Claude-SearchBot")!.category).toBe("search");
    expect(rows.find((row) => row.bot === "Perplexity-User")!.category).toBe("assistant");
    expect(rows.find((row) => row.bot === "Bytespider")!.category).toBe("training");
  });

  it("never requests a private or non-public host", async () => {
    const internal = { ...site, host: "localhost" } as ManagedSite;
    const rows = await auditAiCrawlerAccess(internal);
    expect(fetchPublic).not.toHaveBeenCalled();
    expect(rows.every((row) => row.access === "unknown")).toBe(true);
  });
});
