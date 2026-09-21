/**
 * Parsers for the files and directives that decide whether AI systems may
 * retrieve and quote a page. Kept free of I/O so they can be unit tested.
 */

export interface LlmsTxtEvidence {
  /** A real llms.txt was served, rather than a soft-404 HTML page. */
  present: boolean;
  /** Present and structured as llmstxt.org describes. */
  valid: boolean;
  status: number | null;
  contentType: string | null;
  bytes: number;
  title: string | null;
  sectionCount: number;
  linkCount: number;
  hash: string | null;
  problems: string[];
}

const TEXTUAL = /^(text\/plain|text\/markdown|text\/x-markdown|application\/octet-stream)\b/i;

export function evaluateLlmsTxt(input: {
  status: number | null;
  contentType: string | null;
  body: string;
  hash?: string | null;
}): LlmsTxtEvidence {
  const body = input.body.replace(/^﻿/, "");
  const base: LlmsTxtEvidence = {
    present: false, valid: false, status: input.status, contentType: input.contentType,
    bytes: Buffer.byteLength(input.body, "utf8"), title: null, sectionCount: 0, linkCount: 0,
    hash: input.hash ?? null, problems: [],
  };
  if (input.status !== 200) return { ...base, problems: input.status == null ? ["unreachable"] : ["http_status"] };
  // A 200 that is really an HTML error page is the common failure, so the body
  // is sniffed as well as the declared type.
  if (input.contentType && !TEXTUAL.test(input.contentType)) return { ...base, problems: ["not_text"] };
  if (/^\s*(<!doctype|<html)/i.test(body)) return { ...base, problems: ["html_body"] };
  if (!body.trim()) return { ...base, problems: ["empty"] };

  const present = { ...base, present: true };
  const lines = body.split(/\r\n|\r|\n/);
  const problems: string[] = [];
  const first = lines.find((line) => line.trim());
  const title = first?.match(/^#\s+(.+?)\s*$/)?.[1] ?? null;
  if (!title) problems.push("missing_h1");

  let inSections = false;
  let sectionCount = 0;
  let linkCount = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line)) { inSections = true; sectionCount += 1; continue; }
    if (!inSections) continue;
    // Only list items inside the H2 file lists carry the link grammar; prose
    // bullets above the first H2 are allowed by the specification.
    if (!/^\s*[-*]\s+/.test(line)) continue;
    if (/^\s*[-*]\s+\[[^\]]*\]\([^)\s]+\)\s*(:.*)?$/.test(line)) linkCount += 1;
    else if (!problems.includes("malformed_link")) problems.push("malformed_link");
  }
  return { ...present, valid: problems.length === 0, title, sectionCount, linkCount, problems };
}

export interface SnippetDirectives {
  noindex: boolean;
  nosnippet: boolean;
  /** -1 means "no limit"; null means the directive was not set. */
  maxSnippet: number | null;
  noai: boolean;
  noimageai: boolean;
  /** Every directive token seen, for evidence. */
  tokens: string[];
}

/**
 * Parse robots directives from any mix of `meta[name=robots]`,
 * `meta[name=googlebot]` and `X-Robots-Tag`. A header may carry a
 * `useragent: directive` prefix, which is unwrapped before matching.
 */
export function parseRobotsDirectives(...sources: (string | null | undefined)[]): SnippetDirectives {
  const result: SnippetDirectives = { noindex: false, nosnippet: false, maxSnippet: null, noai: false, noimageai: false, tokens: [] };
  for (const source of sources) {
    if (!source) continue;
    for (const raw of source.split(",")) {
      let token = raw.trim().toLowerCase();
      if (!token) continue;
      const limit = token.match(/^(?:[a-z0-9_*-]+\s*:\s*)?max-snippet\s*:\s*(-?\d+)$/);
      if (limit) {
        const value = Number(limit[1]);
        result.maxSnippet = result.maxSnippet === null ? value : Math.min(result.maxSnippet, value < 0 ? Number.MAX_SAFE_INTEGER : value);
        result.tokens.push(token);
        continue;
      }
      // Strip a user-agent prefix such as "googlebot: nosnippet".
      const prefixed = token.match(/^[a-z0-9_*-]+\s*:\s*(.+)$/);
      if (prefixed && !/^(unavailable_after|max-image-preview|max-video-preview)\b/.test(token)) token = prefixed[1]!.trim();
      result.tokens.push(token);
      if (token === "noindex" || token === "none") result.noindex = true;
      if (token === "nosnippet") result.nosnippet = true;
      if (token === "noai") result.noai = true;
      if (token === "noimageai") result.noimageai = true;
    }
  }
  if (result.maxSnippet === Number.MAX_SAFE_INTEGER) result.maxSnippet = -1;
  return result;
}

/** Google shows no AI snippet below this length, so a smaller cap is worth flagging. */
export const MIN_USEFUL_SNIPPET = 160;

/**
 * Issue ids for a page's eligibility to be quoted in an AI answer. A page can
 * be indexed and still be barred from every snippet, which is what these catch.
 */
export function snippetIssues(directives: SnippetDirectives, dataNosnippetCount = 0): string[] {
  const issues: string[] = [];
  if (directives.nosnippet || directives.maxSnippet === 0) issues.push("ai_snippet_blocked");
  else if (directives.maxSnippet !== null && directives.maxSnippet > 0 && directives.maxSnippet < MIN_USEFUL_SNIPPET) issues.push("ai_snippet_limited");
  if (dataNosnippetCount > 0) issues.push("ai_partial_nosnippet");
  return issues;
}
