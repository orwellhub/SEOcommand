import type { SeoProvider } from "../contracts";

/**
 * DataForSEO adapter (scaffold).
 *
 * This is intentionally NOT wired up. It documents exactly which DataForSEO
 * endpoints feed each contract method, so activation is a matter of filling in
 * the fetch calls and normalisers — not redesigning the interface.
 *
 * Endpoint mapping (see docs/live-connection-plan.md):
 *   keywords / keywordLists   → DataForSEO Labs: ranked_keywords, keyword_ideas
 *   rankSnapshots / buckets   → SERP API: live/advanced + Labs historical
 *   visibility                → Labs: domain_rank_overview (visibility index)
 *   competitors               → Labs: competitors_domain, domain_intersection
 *   issues / health / crawl   → OnPage API: task_post → summary → pages
 *   backlinks / referring     → Backlinks API: backlinks, referring_domains
 *   prompts (AI visibility)   → LLM Responses / Mentions API
 *   content                   → Labs relevant_pages + OnPage content parsing
 *
 * Credentials come from process.env.DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD and
 * are used ONLY server-side. Never import this into a client component.
 */
export function createDataForSeoProvider(): SeoProvider {
  const notConnected = () => {
    throw new Error(
      "DataForSEO provider is not connected. Add credentials and implement the " +
        "adapter methods before selecting the live provider. See docs/live-connection-plan.md.",
    );
  };

  return {
    name: "DataForSEO",
    live: true,
    keywords: notConnected,
    keywordLists: notConnected,
    rankSnapshots: notConnected,
    positionBuckets: notConnected,
    visibility: notConnected,
    competitors: notConnected,
    issues: notConnected,
    health: notConnected,
    crawlRuns: notConnected,
    backlinks: notConnected,
    referringDomains: notConnected,
    prompts: notConnected,
    content: notConnected,
  } as unknown as SeoProvider;
}
