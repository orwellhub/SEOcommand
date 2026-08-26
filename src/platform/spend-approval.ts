import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { currentMonth } from "@/providers/dataforseo/cost";
import { BudgetExceededError } from "@/providers/dataforseo/errors";
import type { SpendCategory } from "./types";

const ENDPOINT_CATEGORY: Record<string, SpendCategory> = {
  serpOrganicLive: "rankings",
  onPageTaskPost: "crawling",
  onPageSummary: "crawling",
  onPagePages: "crawling",
  backlinksSummary: "backlinks",
  backlinksList: "backlinks",
  backlinksReferringDomains: "backlinks",
  backlinksHistory: "backlinks",
  backlinksDomainIntersection: "backlinks",
  labsCompetitorsDomain: "competitors",
  labsDomainIntersection: "competitors",
  labsDomainRankOverview: "competitors",
  labsRankedKeywords: "competitors",
  labsRelevantPages: "competitors",
  aiLlmResponses: "ai",
  googleAiModeLive: "ai",
  businessGoogleMyBusinessInfoLive: "local_seo",
  serpGoogleMapsLiveAdvanced: "local_seo",
};

export function spendCategoryForEndpoint(endpoint: string): SpendCategory | null {
  return ENDPOINT_CATEGORY[endpoint] ?? null;
}

/**
 * Enforce the approved monthly ceiling at the provider boundary. Registry-only
 * legacy sites retain the global guard; every database-managed site must have
 * explicit approval and enough site-level headroom before a paid call runs.
 */
export async function assertSiteSpendAllowed(
  siteSlug: string | null | undefined,
  endpoint: string,
  estimateUsd: number,
) {
  if (!siteSlug || !hasDatabase()) return;
  const [site] = await db()
    .select({
      approval: schema.siteProfiles.spendApproval,
      ceiling: schema.siteProfiles.approvedMonthlyUsd,
      budgetLimits: schema.siteProfiles.budgetLimits,
    })
    .from(schema.siteProfiles)
    .where(eq(schema.siteProfiles.slug, siteSlug))
    .limit(1);
  if (!site) return; // legacy registry site; global guard still applies
  const ceiling = site.ceiling ?? 0;
  if (site.approval !== "approved" || ceiling <= 0) {
    throw new BudgetExceededError(0, ceiling, `${endpoint} (site approval required)`);
  }
  const month = currentMonth();
  const [usage] = await db()
    .select({ spent: sql<number>`coalesce(sum(${schema.providerSpend.costUsd}), 0)::float` })
    .from(schema.providerSpend)
    .where(
      and(
        eq(schema.providerSpend.provider, "dataforseo"),
        eq(schema.providerSpend.domainSlug, siteSlug),
        eq(schema.providerSpend.month, month),
      ),
    );
  const spent = Number(usage?.spent ?? 0);
  if (spent + estimateUsd > ceiling) {
    throw new BudgetExceededError(spent, ceiling, `${endpoint} (site ceiling)`);
  }
  const category = spendCategoryForEndpoint(endpoint);
  const categoryCeiling = category ? site.budgetLimits[category] : null;
  if (category && categoryCeiling != null && categoryCeiling > 0) {
    const categoryEndpoints = Object.entries(ENDPOINT_CATEGORY)
      .filter(([, value]) => value === category)
      .map(([key]) => key);
    const [categoryUsage] = await db()
      .select({ spent: sql<number>`coalesce(sum(${schema.providerSpend.costUsd}), 0)::float` })
      .from(schema.providerSpend)
      .where(and(
        eq(schema.providerSpend.provider, "dataforseo"),
        eq(schema.providerSpend.domainSlug, siteSlug),
        eq(schema.providerSpend.month, month),
        inArray(schema.providerSpend.endpoint, categoryEndpoints),
      ));
    const categorySpent = Number(categoryUsage?.spent ?? 0);
    if (categorySpent + estimateUsd > categoryCeiling) {
      throw new BudgetExceededError(categorySpent, categoryCeiling, `${endpoint} (${category} ceiling)`);
    }
  }
}
