import { describe, expect, it } from "vitest";
import { evaluateLlmsTxt, parseRobotsDirectives, snippetIssues } from "./discovery-files";

const llms = (body: string, overrides: Partial<{ status: number | null; contentType: string | null }> = {}) =>
  evaluateLlmsTxt({ status: 200, contentType: "text/plain", body, ...overrides });

describe("llms.txt evaluation", () => {
  it("accepts a well-formed file", () => {
    const result = llms("# Example\n\n> Summary line.\n\n## Docs\n\n- [Guide](https://example.test/guide): how to start\n- [API](https://example.test/api)\n");
    expect(result.present).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.title).toBe("Example");
    expect(result.sectionCount).toBe(1);
    expect(result.linkCount).toBe(2);
  });

  it("treats a soft-404 HTML body as absent", () => {
    const result = llms("<!DOCTYPE html>\n<html><body>Not found</body></html>", { contentType: "text/html" });
    expect(result.present).toBe(false);
    expect(result.problems).toContain("not_text");
  });

  it("treats HTML served as text/plain as absent too", () => {
    expect(llms("  <html><body>nope</body></html>").problems).toContain("html_body");
  });

  it("tolerates a byte-order mark before the heading", () => {
    expect(llms("﻿# Example\n").valid).toBe(true);
  });

  it("marks a file with no H1 invalid but still present", () => {
    const result = llms("Just some text\n\n## Docs\n");
    expect(result.present).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.problems).toContain("missing_h1");
  });

  it("flags malformed link lines inside H2 sections", () => {
    const result = llms("# Example\n\n## Docs\n\n- not a link\n");
    expect(result.valid).toBe(false);
    expect(result.problems).toContain("malformed_link");
  });

  it("allows prose bullets before the first H2", () => {
    expect(llms("# Example\n\n- a plain bullet\n\n## Docs\n\n- [Guide](https://example.test/g)\n").valid).toBe(true);
  });

  it("reports an empty file and a missing file distinctly", () => {
    expect(llms("   ").problems).toContain("empty");
    expect(llms("", { status: 404 }).problems).toContain("http_status");
    expect(llms("", { status: null }).problems).toContain("unreachable");
  });

  it("accepts markdown and octet-stream content types", () => {
    expect(llms("# A\n", { contentType: "text/markdown; charset=utf-8" }).present).toBe(true);
    expect(llms("# A\n", { contentType: "application/octet-stream" }).present).toBe(true);
    expect(llms("# A\n", { contentType: null }).present).toBe(true);
  });
});

describe("robots directive parsing", () => {
  it("reads snippet directives from a meta value", () => {
    const d = parseRobotsDirectives("index, nosnippet");
    expect(d.nosnippet).toBe(true);
    expect(d.noindex).toBe(false);
  });

  it("reads a max-snippet limit", () => {
    expect(parseRobotsDirectives("max-snippet:50").maxSnippet).toBe(50);
    expect(parseRobotsDirectives("max-snippet:-1").maxSnippet).toBe(-1);
  });

  it("is case-insensitive and tolerates spacing", () => {
    expect(parseRobotsDirectives("  NoSnippet ,  MAX-SNIPPET : 20 ").nosnippet).toBe(true);
    expect(parseRobotsDirectives("  NoSnippet ,  MAX-SNIPPET : 20 ").maxSnippet).toBe(20);
  });

  it("unwraps a user-agent prefix from an X-Robots-Tag header", () => {
    expect(parseRobotsDirectives("googlebot: nosnippet").nosnippet).toBe(true);
    expect(parseRobotsDirectives("googlebot: max-snippet:0").maxSnippet).toBe(0);
  });

  it("combines several sources and keeps the tightest limit", () => {
    expect(parseRobotsDirectives("max-snippet:120", "max-snippet:40").maxSnippet).toBe(40);
    expect(parseRobotsDirectives(null, undefined, "noindex").noindex).toBe(true);
  });

  it("treats none as noindex and recognises the AI opt-outs", () => {
    expect(parseRobotsDirectives("none").noindex).toBe(true);
    expect(parseRobotsDirectives("noai, noimageai").noai).toBe(true);
    expect(parseRobotsDirectives("noai, noimageai").noimageai).toBe(true);
  });

  it("does not mistake other directives for a user-agent prefix", () => {
    expect(parseRobotsDirectives("max-image-preview:large").nosnippet).toBe(false);
    expect(parseRobotsDirectives("unavailable_after: 2026-01-01").noindex).toBe(false);
  });
});

describe("snippet issue derivation", () => {
  it("flags a page barred from every snippet", () => {
    expect(snippetIssues(parseRobotsDirectives("nosnippet"))).toContain("ai_snippet_blocked");
    expect(snippetIssues(parseRobotsDirectives("max-snippet:0"))).toContain("ai_snippet_blocked");
  });

  it("flags a snippet capped below a useful length", () => {
    expect(snippetIssues(parseRobotsDirectives("max-snippet:50"))).toEqual(["ai_snippet_limited"]);
  });

  it("does not flag a generous or unlimited cap", () => {
    expect(snippetIssues(parseRobotsDirectives("max-snippet:200"))).toEqual([]);
    expect(snippetIssues(parseRobotsDirectives("max-snippet:-1"))).toEqual([]);
    expect(snippetIssues(parseRobotsDirectives(""))).toEqual([]);
  });

  it("flags partially excluded content separately", () => {
    expect(snippetIssues(parseRobotsDirectives(""), 3)).toEqual(["ai_partial_nosnippet"]);
  });

  it("does not report both a block and a limit for one page", () => {
    expect(snippetIssues(parseRobotsDirectives("nosnippet, max-snippet:20"))).toEqual(["ai_snippet_blocked"]);
  });
});
