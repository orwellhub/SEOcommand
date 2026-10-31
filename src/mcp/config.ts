/**
 * Static configuration for the SEO Command MCP endpoint (/api/mcp).
 * See docs/mcp-connector.md.
 */

/** Ledger and audit label for everything done through the connector. */
export const MCP_ACTOR = "claude-mcp";

export const MCP_SERVER_INFO = {
  name: "seocommand",
  title: "SEO Command",
  version: "1.0.0",
} as const;

/** Modern (stateless, per-request `_meta`) protocol revisions served. */
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"] as const;
/** Legacy (initialize handshake) revisions served, newest first. */
export const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS];

export const MCP_INSTRUCTIONS = [
  "SEO Command is Gareth's own SEO platform: stored DataForSEO, Google Search Console, GA4 and AI-visibility data for every website in the portfolio.",
  "Start with list_sites to get site slugs. Read tools (get_*, list_*) are free and read stored snapshots; check collectedAt/capturedOn fields for freshness.",
  "keyword_research, keyword_metrics, keyword_gap, run_ai_visibility_now and refresh_site(source=dataforseo) spend DataForSEO budget.",
  "Paid calls are refused when the estimate would pass the claude-mcp monthly budget or the overall $200 monthly guardrail; call get_spend first when unsure.",
].join(" ");

/** Minimum accepted length of SEOCOMMAND_MCP_TOKEN. */
export const MIN_TOKEN_LENGTH = 32;

/** Gareth's default for the connector's own monthly DataForSEO budget. */
export const DEFAULT_MCP_MONTHLY_BUDGET_USD = 50;

/**
 * The connector's monthly budget in USD from SEOCOMMAND_MCP_MONTHLY_BUDGET_USD
 * (default 50). A malformed or negative value falls back to 0, which blocks
 * paid tools rather than silently allowing unlimited spend.
 */
export function mcpMonthlyBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.SEOCOMMAND_MCP_MONTHLY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_MCP_MONTHLY_BUDGET_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Origins allowed to call the endpoint from a browser context. Requests
 * without an Origin header (claude.ai's connector backend, Claude Code) are
 * unaffected. Extra origins: SEOCOMMAND_MCP_ALLOWED_ORIGINS, comma-separated. */
export function allowedOrigins(env: Record<string, string | undefined> = process.env): Set<string> {
  const extra = (env.SEOCOMMAND_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set(["https://claude.ai", "https://claude.com", ...extra]);
}
