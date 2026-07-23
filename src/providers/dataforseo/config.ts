import type { DomainId } from "@/lib/types";
import { DOMAIN_MAP } from "@/data/domains";

/**
 * DataForSEO runtime configuration, driven entirely by server-side env vars.
 * Never import this into a client component — it reads credentials.
 */
export interface DataForSeoConfig {
  login: string;
  password: string;
  baseUrl: string;
  monthlyBudgetUsd: number;
}

export function readConfig(): DataForSeoConfig | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return {
    login,
    password,
    baseUrl: (process.env.DATAFORSEO_BASE_URL ?? "https://api.dataforseo.com").replace(/\/$/, ""),
    monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? "200"),
  };
}

export function basicAuthHeader(cfg: DataForSeoConfig): string {
  const token = Buffer.from(`${cfg.login}:${cfg.password}`).toString("base64");
  return `Basic ${token}`;
}

export function locationFor(domainId: DomainId): { location_code: number; language_code: string } {
  const domain = DOMAIN_MAP[domainId];
  if (!domain) throw new Error(`Unknown domain "${domainId}".`);

  const suffix = domainId.toUpperCase();
  const rawOverride = process.env[`DATAFORSEO_LOCATION_${suffix}`];
  const override = rawOverride ? Number(rawOverride) : null;
  const locationCode = Number.isInteger(override) && Number(override) > 0
    ? Number(override)
    : domain.dataForSeoLocationCode;

  if (!locationCode) {
    throw new Error(
      `No DataForSEO location configured for ${domain.name}. ` +
        `Set DATAFORSEO_LOCATION_${suffix} to the priority market's DataForSEO location code.`,
    );
  }

  return {
    location_code: locationCode,
    language_code: process.env[`DATAFORSEO_LANGUAGE_${suffix}`] || domain.dataForSeoLanguageCode,
  };
}

/**
 * Verified DataForSEO endpoints (each returned status 20000 on a real call for
 * this account) plus the direct sibling endpoints the adapter also uses. Paths
 * are relative to baseUrl.
 */
export const ENDPOINTS = {
  // --- operator-verified ---
  serpOrganicLive: "/v3/serp/google/organic/live/advanced",
  labsDomainRankOverview: "/v3/dataforseo_labs/google/domain_rank_overview/live",
  backlinksSummary: "/v3/backlinks/summary/live",
  keywordsSearchVolume: "/v3/keywords_data/google_ads/search_volume/live",
  onPageTaskPost: "/v3/on_page/task_post",
  onPageSummary: (taskId: string) => `/v3/on_page/summary/${taskId}`,
  aiLlmResponses: "/v3/ai_optimization/chat_gpt/llm_responses/live",
  aiLlmModels: "/v3/ai_optimization/chat_gpt/llm_responses/models",
  // --- direct siblings on the same (verified) APIs ---
  labsRankedKeywords: "/v3/dataforseo_labs/google/ranked_keywords/live",
  labsKeywordIdeas: "/v3/dataforseo_labs/google/keyword_ideas/live",
  labsCompetitorsDomain: "/v3/dataforseo_labs/google/competitors_domain/live",
  backlinksList: "/v3/backlinks/backlinks/live",
  backlinksReferringDomains: "/v3/backlinks/referring_domains/live",
} as const;

/**
 * Conservative pre-flight cost estimates (USD) used by the spend guard to block
 * a call *before* it runs. Actual cost is read from each response and recorded.
 * These are deliberately generous upper bounds; tune against real invoices.
 */
export const COST_ESTIMATE_USD: Record<string, number> = {
  serpOrganicLive: 0.003,
  labsDomainRankOverview: 0.03,
  backlinksSummary: 0.02,
  keywordsSearchVolume: 0.05,
  onPageTaskPost: 0.03,
  onPageSummary: 0.0,
  aiLlmResponses: 0.06,
  labsRankedKeywords: 0.05,
  labsKeywordIdeas: 0.05,
  labsCompetitorsDomain: 0.03,
  backlinksList: 0.04,
  backlinksReferringDomains: 0.03,
};
