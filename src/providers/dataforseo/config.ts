import type { DomainId } from "@/lib/types";
import { DOMAIN_MAP } from "@/data/domains";
import type { ManagedSite } from "@/platform/types";

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

export function locationForSite(site: ManagedSite): { location_code: number; language_code: string } {
  const suffix = site.id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const rawOverride = process.env[`DATAFORSEO_LOCATION_${suffix}`];
  const override = rawOverride ? Number(rawOverride) : null;
  const locationCode = Number.isInteger(override) && Number(override) > 0
    ? Number(override)
    : site.dataForSeoLocationCode;
  if (!locationCode) throw new Error(`No DataForSEO location configured for ${site.name}.`);
  return {
    location_code: locationCode,
    language_code: process.env[`DATAFORSEO_LANGUAGE_${suffix}`] || site.dataForSeoLanguageCode,
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
  onPagePages: "/v3/on_page/pages",
  aiLlmResponses: (provider: "chat_gpt" | "claude" | "gemini" | "perplexity") =>
    `/v3/ai_optimization/${provider}/llm_responses/live`,
  aiLlmModels: (provider: "chat_gpt" | "claude" | "gemini" | "perplexity") =>
    `/v3/ai_optimization/${provider}/llm_responses/models`,
  googleAiModeLive: "/v3/serp/google/ai_mode/live/advanced",
  // --- direct siblings on the same (verified) APIs ---
  labsRankedKeywords: "/v3/dataforseo_labs/google/ranked_keywords/live",
  labsKeywordIdeas: "/v3/dataforseo_labs/google/keyword_ideas/live",
  labsCompetitorsDomain: "/v3/dataforseo_labs/google/competitors_domain/live",
  labsDomainIntersection: "/v3/dataforseo_labs/google/domain_intersection/live",
  labsRelevantPages: "/v3/dataforseo_labs/google/relevant_pages/live",
  backlinksList: "/v3/backlinks/backlinks/live",
  backlinksReferringDomains: "/v3/backlinks/referring_domains/live",
  backlinksHistory: "/v3/backlinks/history/live",
  backlinksDomainIntersection: "/v3/backlinks/domain_intersection/live",
  businessGoogleMyBusinessInfoLive: "/v3/business_data/google/my_business_info/live",
  serpGoogleMapsLiveAdvanced: "/v3/serp/google/maps/live/advanced",
  serpGoogleLocations: "/v3/serp/google/locations",
  userData: "/v3/appendix/user_data",
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
  onPagePages: 0.0,
  aiLlmResponses: 0.06,
  googleAiModeLive: 0.008,
  labsRankedKeywords: 0.05,
  labsKeywordIdeas: 0.05,
  labsCompetitorsDomain: 0.03,
  labsDomainIntersection: 0.04,
  labsRelevantPages: 0.04,
  backlinksList: 0.04,
  backlinksReferringDomains: 0.03,
  backlinksHistory: 0.04,
  backlinksDomainIntersection: 0.08,
  businessGoogleMyBusinessInfoLive: 0.02,
  serpGoogleMapsLiveAdvanced: 0.003,
};
