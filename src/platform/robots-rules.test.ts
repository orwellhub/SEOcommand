import { describe, expect, it } from "vitest";
import { groupFor, isAllowed, matchRule, parseRobots, sitemapUrls } from "./robots-rules";

describe("robots.txt parsing", () => {
  it("groups consecutive user-agent lines and closes a group on a rule", () => {
    const groups = parseRobots("User-agent: A\nUser-agent: B\nDisallow: /x\nUser-agent: C\nDisallow: /y");
    expect(groups).toHaveLength(2);
    expect(groups[0]!.agents).toEqual(["a", "b"]);
    expect(groups[1]!.agents).toEqual(["c"]);
  });

  it("ignores comments, blank lines and carriage returns", () => {
    const groups = parseRobots("# lead\r\nUser-agent: GPTBot\r\n\r\nDisallow: /private/ # trailing\r\n");
    expect(groups[0]!.rules).toEqual([{ kind: "disallow", path: "/private/" }]);
  });

  it("treats an empty Disallow as no restriction rather than a rule", () => {
    expect(parseRobots("User-agent: *\nDisallow:")[0]!.rules).toEqual([]);
    expect(isAllowed("User-agent: *\nDisallow:", "GPTBot", "/anything")).toBe(true);
  });

  it("reads sitemap directives", () => {
    expect(sitemapUrls("Sitemap: https://a.test/s.xml\nUser-agent: *\nSitemap: https://a.test/s.xml")).toEqual(["https://a.test/s.xml"]);
    expect(sitemapUrls("User-agent: *\nDisallow: /")).toEqual([]);
  });
});

describe("group selection", () => {
  const robots = "User-agent: *\nDisallow: /\nUser-agent: OAI-SearchBot\nAllow: /";

  it("prefers a named group over the wildcard", () => {
    expect(groupFor(robots, "OAI-SearchBot")?.wildcard).toBe(false);
    expect(groupFor(robots, "ClaudeBot")?.wildcard).toBe(true);
  });

  it("matches tokens case-insensitively", () => {
    expect(isAllowed(robots, "oai-searchbot", "/page")).toBe(true);
  });

  it("does not treat a shorter token as a prefix match", () => {
    // A `Claude` group must not be read as governing Claude-User.
    expect(groupFor("User-agent: Claude\nDisallow: /", "Claude-User")).toBeNull();
  });

  it("merges groups that repeat the same token", () => {
    const merged = groupFor("User-agent: GPTBot\nDisallow: /a\nUser-agent: GPTBot\nDisallow: /b", "GPTBot");
    expect(merged?.rules).toHaveLength(2);
  });

  it("returns null when neither the token nor a wildcard group exists", () => {
    expect(groupFor("User-agent: Bingbot\nDisallow: /", "GPTBot")).toBeNull();
    expect(isAllowed("User-agent: Bingbot\nDisallow: /", "GPTBot", "/")).toBe(true);
  });
});

describe("path matching", () => {
  it("applies the longest matching pattern", () => {
    const robots = "User-agent: *\nDisallow: /blog/\nAllow: /blog/public/";
    expect(isAllowed(robots, "GPTBot", "/blog/draft")).toBe(false);
    expect(isAllowed(robots, "GPTBot", "/blog/public/post")).toBe(true);
  });

  it("lets Allow win an equal-length tie", () => {
    expect(isAllowed("User-agent: *\nDisallow: /page\nAllow: /page", "GPTBot", "/page")).toBe(true);
  });

  it("expands * wildcards", () => {
    expect(isAllowed("User-agent: *\nDisallow: /*.pdf", "GPTBot", "/files/report.pdf")).toBe(false);
    expect(isAllowed("User-agent: *\nDisallow: /*.pdf", "GPTBot", "/files/report.html")).toBe(true);
  });

  it("anchors a trailing $", () => {
    const robots = "User-agent: *\nDisallow: /page$";
    expect(isAllowed(robots, "GPTBot", "/page")).toBe(false);
    expect(isAllowed(robots, "GPTBot", "/page/child")).toBe(true);
  });

  it("treats a mid-pattern $ as a literal", () => {
    expect(isAllowed("User-agent: *\nDisallow: /a$b", "GPTBot", "/a$b")).toBe(false);
  });

  it("normalises percent-encoded unreserved characters on both sides", () => {
    expect(isAllowed("User-agent: *\nDisallow: /caf%C3%A9/", "GPTBot", "/caf%C3%A9/menu")).toBe(false);
    expect(isAllowed("User-agent: *\nDisallow: /a%2Db/", "GPTBot", "/a-b/c")).toBe(false);
  });

  it("allows a path no rule matches and reports the winning rule", () => {
    const group = groupFor("User-agent: *\nDisallow: /private/", "GPTBot");
    expect(matchRule(group, "/public")).toBeNull();
    expect(matchRule(group, "/private/x")).toEqual({ kind: "disallow", path: "/private/" });
  });

  it("handles an empty robots.txt as fully allowed", () => {
    expect(isAllowed("", "GPTBot", "/")).toBe(true);
  });
});
