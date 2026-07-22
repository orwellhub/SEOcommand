import type { AiPrompt, DomainId, Provenance } from "@/lib/types";
import type { Envelope, SeoProvider } from "../contracts";
import { DOMAIN_MAP } from "@/data/domains";
import { isoDate } from "@/lib/dates";
import { ENDPOINTS, LOCATION_MAP, readConfig } from "./config";
import { MissingCredentialsError } from "./errors";
import { DataForSeoClient } from "./client";
import { InMemorySpendStore, SpendGuard, type SpendStore } from "./cost";
import { PgSpendStore } from "./store-db";
import {
  backlinkSummaryCounts,
  normalizeBacklinks,
  normalizeCompetitors,
  normalizeDomainOverview,
  normalizeOnPageHealth,
  normalizeRankedKeywords,
  normalizeReferringDomains,
  rankedKeywordsToSnapshots,
} from "./normalizers";

/**
 * Live DataForSEO provider.
 *
 * Composes: env config → spend guard (monthly $200 guardrail, DB-backed when
 * DATABASE_URL is present) → guarded HTTP client → response normalisers → the
 * canonical `SeoProvider` contract. Server-side only.
 *
 * Endpoint verification status is documented in config.ts and
 * docs/dataforseo-integration.md. Methods without a wired endpoint return an
 * empty envelope (never fabricated data).
 */

function makeGuard(limitUsd: number): SpendGuard {
  let store: SpendStore = new InMemorySpendStore();
  if (process.env.DATABASE_URL) {
    // Durable spend tracking across restarts/deploys.
    store = new PgSpendStore();
  }
  return new SpendGuard(store, limitUsd);
}

function liveProvenance(domainId: DomainId): Provenance {
  const today = isoDate(new Date());
  const loc = LOCATION_MAP[domainId];
  return {
    source: "dataforseo",
    collectedAt: new Date().toISOString(),
    rangeStart: today,
    rangeEnd: today,
    location: String(loc.location_code),
    device: "desktop",
    freshness: "fresh",
    mode: "live",
  };
}

function envelope<T>(domainId: DomainId, data: T): Envelope<T> {
  return { data, provenance: liveProvenance(domainId) };
}

export function createDataForSeoProvider(): SeoProvider {
  const cfg = readConfig();
  if (!cfg) throw new MissingCredentialsError();
  const client = new DataForSeoClient(cfg, makeGuard(cfg.monthlyBudgetUsd));

  function target(domainId: DomainId) {
    return DOMAIN_MAP[domainId].host;
  }
  function labsBody(domainId: DomainId, extra: Record<string, unknown> = {}) {
    const loc = LOCATION_MAP[domainId];
    return [{ target: target(domainId), location_code: loc.location_code, language_code: loc.language_code, limit: 200, ...extra }];
  }

  return {
    name: "DataForSEO",
    live: true,

    async keywords(domainId) {
      const { result } = await client.post("labsRankedKeywords", ENDPOINTS.labsRankedKeywords, labsBody(domainId), {
        domainSlug: domainId,
      });
      return envelope(domainId, normalizeRankedKeywords(result as Record<string, unknown>[], domainId));
    },

    async keywordLists(domainId) {
      // Saved lists are a user-managed concept, not a provider fetch.
      return envelope(domainId, []);
    },

    async rankSnapshots(domainId) {
      const { result } = await client.post("labsRankedKeywords", ENDPOINTS.labsRankedKeywords, labsBody(domainId), {
        domainSlug: domainId,
      });
      return envelope(
        domainId,
        rankedKeywordsToSnapshots(result as Record<string, unknown>[], domainId, isoDate(new Date())),
      );
    },

    async positionBuckets(domainId) {
      const { result } = await client.post(
        "labsDomainRankOverview",
        ENDPOINTS.labsDomainRankOverview,
        labsBody(domainId),
        { domainSlug: domainId },
      );
      return envelope(domainId, normalizeDomainOverview(result as Record<string, unknown>[]).buckets);
    },

    async visibility(domainId) {
      const { result } = await client.post(
        "labsDomainRankOverview",
        ENDPOINTS.labsDomainRankOverview,
        labsBody(domainId),
        { domainSlug: domainId },
      );
      const { visibility } = normalizeDomainOverview(result as Record<string, unknown>[]);
      return envelope(domainId, [{ date: isoDate(new Date()), value: visibility }]);
    },

    async competitors(domainId) {
      const { result } = await client.post(
        "labsCompetitorsDomain",
        ENDPOINTS.labsCompetitorsDomain,
        labsBody(domainId),
        { domainSlug: domainId },
      );
      return envelope(domainId, normalizeCompetitors(result as Record<string, unknown>[], domainId));
    },

    async issues(domainId) {
      const { summary } = await client.onPageSummary(target(domainId), { domainSlug: domainId });
      return envelope(domainId, normalizeOnPageHealth(summary).issues);
    },

    async health(domainId) {
      const { summary } = await client.onPageSummary(target(domainId), { domainSlug: domainId });
      return envelope(domainId, normalizeOnPageHealth(summary).breakdown);
    },

    async crawlRuns(domainId) {
      const { summary } = await client.onPageSummary(target(domainId), { domainSlug: domainId });
      const run = normalizeOnPageHealth(summary).crawlRun;
      return envelope(domainId, run ? [{ ...run, domainId }] : []);
    },

    async backlinks(domainId) {
      const { result } = await client.post(
        "backlinksList",
        ENDPOINTS.backlinksList,
        [{ target: target(domainId), limit: 100, mode: "as_is" }],
        { domainSlug: domainId },
      );
      return envelope(domainId, normalizeBacklinks(result as Record<string, unknown>[], domainId));
    },

    async referringDomains(domainId) {
      const { result } = await client.post(
        "backlinksReferringDomains",
        ENDPOINTS.backlinksReferringDomains,
        [{ target: target(domainId), limit: 100 }],
        { domainSlug: domainId },
      );
      return envelope(domainId, normalizeReferringDomains(result as Record<string, unknown>[], domainId));
    },

    async prompts(domainId) {
      // Run the domain's tracked prompts through the AI Optimization API and
      // detect brand mention/citation in each response.
      const { SEED } = await import("@/data/seed");
      const brand = DOMAIN_MAP[domainId].name.toLowerCase();
      const host = DOMAIN_MAP[domainId].host.toLowerCase();
      const configured = SEED.aiPrompts[domainId];
      const out: AiPrompt[] = [];
      for (const p of configured) {
        const { result } = await client.post<Record<string, any>>(
          "aiLlmResponses",
          ENDPOINTS.aiLlmResponses,
          [{ user_prompt: p.prompt, model_name: "gpt-4o", max_output_tokens: 800 }],
          { domainSlug: domainId },
        );
        const text = JSON.stringify(result?.[0]?.items ?? result ?? {}).toLowerCase();
        const mentioned = text.includes(brand) || text.includes(host);
        const cited = text.includes(host);
        out.push({
          ...p,
          mentionRate: mentioned ? 100 : 0,
          citationRate: cited ? 100 : 0,
          cited,
          lastChecked: isoDate(new Date()),
          sampleResponse: mentioned
            ? `${DOMAIN_MAP[domainId].name} was referenced in the live AI response.`
            : `${DOMAIN_MAP[domainId].name} was not referenced in the live AI response — coverage gap.`,
        });
      }
      return envelope(domainId, out);
    },

    async content(domainId) {
      // Content inventory requires Labs relevant_pages + OnPage parsing (not yet
      // wired). Return empty rather than fabricating.
      return envelope(domainId, []);
    },
  };
}

/** Lightweight credential + budget probe for the go-live health check. */
export async function probeDataForSeo(): Promise<{
  configured: boolean;
  spend?: Awaited<ReturnType<DataForSeoClient["guardStatus"]>>;
  models?: number;
  error?: string;
}> {
  const cfg = readConfig();
  if (!cfg) return { configured: false };
  const client = new DataForSeoClient(cfg, makeGuard(cfg.monthlyBudgetUsd));
  try {
    // The models call is the real credential test (zero cost).
    const models = await client.getMeta<unknown>(ENDPOINTS.aiLlmModels);
    // Spend status depends on the DB/migration; don't let it mask a good probe.
    let spend: Awaited<ReturnType<DataForSeoClient["guardStatus"]>> | undefined;
    try {
      spend = await client.guardStatus();
    } catch {
      spend = undefined;
    }
    return { configured: true, spend, models: models.length };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : String(err) };
  }
}

export { backlinkSummaryCounts };
