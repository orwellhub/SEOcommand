import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase, readLatestSnapshots } from "@/sync/store";
import { locationForSite } from "@/providers/dataforseo/config";
import { RESEARCH_FEATURES, type ResearchFeature, type ResearchInput, type ResearchPayload, type ResearchUnit } from "@/lib/research-evidence";
import type { ManagedSite } from "./types";

const hostSchema = z.string().trim().toLowerCase().transform((value) => value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")).pipe(z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain without a path."));
export const researchInputSchema = z.object({
  maxRows: z.number().int().min(1000).max(50000).optional(),
  market: z.object({ locationCode: z.number().int().positive(), languageCode: z.string().min(2).max(8), label: z.string().min(1).max(200) }).optional(),
  feature: z.enum(RESEARCH_FEATURES.map((feature) => feature.id) as [ResearchFeature, ...ResearchFeature[]]),
  keywords: z.array(z.string().trim().min(1).max(250)).max(100).default([]),
  domains: z.array(hostSchema).max(4).default([]),
  businessId: z.string().uuid().optional(),
  platform: z.enum(["google", "chat_gpt"]).default("google"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  path: z.string().trim().max(500).regex(/^(?:\/(?!\/)[^?#]*)?$/, "Use a relative page or folder path.").optional(),
  pathMode: z.enum(["page", "folder"]).optional(),
});

export async function researchDefaults(site: ManagedSite) {
  const snapshots = hasDatabase() ? await readLatestSnapshots(site.id) : [];
  const rows = (name: string): Record<string, unknown>[] => { const payload = snapshots.find((row) => row.dataset === name)?.payload; return Array.isArray(payload) ? payload : []; };
  const keywords = [...new Set([...rows("keywords").map((row) => row.keyword), ...rows("gsc_queries").map((row) => row.key)].filter((v): v is string => typeof v === "string" && !!v))].slice(0, 20);
  const domains = [...new Set([site.host.replace(/^www\./, ""), ...rows("competitors").map((row) => row.host).filter((v): v is string => typeof v === "string" && !!v)])].slice(0, 4);
  const businesses = hasDatabase() ? await db().select({ id: schema.localSeoLocations.id, name: schema.localSeoLocations.name, placeId: schema.localSeoLocations.placeId, cid: schema.localSeoLocations.cid }).from(schema.localSeoLocations).where(eq(schema.localSeoLocations.siteSlug, site.id)) : [];
  return { keywords, domains, businesses: businesses.map((row) => ({ id: row.id, name: row.name, identified: !!(row.placeId || row.cid) })), market: { ...locationForSite(site), label: site.primaryMarket } };
}

export async function buildResearchPlan(site: ManagedSite, input: ResearchInput, now = new Date()): Promise<ResearchPayload> {
  const location = input.market ? {location_code:input.market.locationCode, language_code:input.market.languageCode} : locationForSite(site), feature = RESEARCH_FEATURES.find((row) => row.id === input.feature)!;
  const clean: ResearchInput = { ...input, keywords: [...new Set(input.keywords)], domains: [...new Set(input.domains)] };
  if (feature.input === "keywords" && !clean.keywords.length) throw new Error("Add at least one keyword.");
  if (feature.input === "domains" && !clean.domains.length) throw new Error("Choose at least one domain.");
  if (clean.feature === "mentions" && clean.platform === "chat_gpt" && location.location_code !== 2840) throw new Error("Indexed ChatGPT mentions currently support the United States market only. Choose Google AI answers for this website's market.");
  if (clean.feature === "mentions" && clean.domains.some((domain) => domain.length > 63)) throw new Error("The AI mention index accepts domains up to 63 characters.");
  const units: ResearchUnit[] = [], notes: string[] = [];
  const add = (endpoint: string, path: string, body: Record<string, unknown>, estimateUsd: number, label: string, mode?: "reviews") => units.push({ id: `${units.length + 1}`, endpoint, path: `/v3/${path}`, body, estimateUsd, label, ...(mode ? { mode } : {}) });
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const historyEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const historyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  switch (clean.feature) {
    case "keyword_bulk": {
      if (clean.keywords.length !== 1) throw new Error("Choose one seed for a background keyword collection.");
      add("labsKeywordIdeas", "dataforseo_labs/google/keyword_ideas/live", { keywords: clean.keywords, ...location, limit: 1000, offset: 0, include_serp_info: true, order_by: ["keyword_info.search_volume,desc"] }, .15, clean.keywords[0]!);
      units[0]!.maxRows = clean.maxRows ?? 1000;
      notes.push("Pages are saved before the next paid request. Collection stops at the selected ceiling or when the provider has no further rows. Results can change while paging; duplicate keywords are merged. The estimate is a maximum, not a promise that this many keywords exist.");
      break;
    }
    case "traffic": for (const target of clean.domains) {
      add("labsDomainRankOverview", "dataforseo_labs/google/domain_rank_overview/live", { target, ...location, use_new_etv: true }, .03, target);
      add("labsHistoricalRankOverview", "dataforseo_labs/google/historical_rank_overview/live", { target, ...location, date_from: date(historyStart), date_to: date(historyEnd), include_clickstream_data: false }, .15, target);
      add("labsRelevantPages", "dataforseo_labs/google/relevant_pages/live", { target, ...location, limit: 100, use_new_etv: true }, .04, target);
    } notes.push("Current search estimates use DataForSEO ETV 2026. Historical estimates use the provider's historical model; no growth percentage is calculated between these two methodologies. Total visits, direct/social/referral traffic and unique visitors are unavailable from this provider."); break;
    case "autocomplete": for (const keyword of clean.keywords) add("serpAutocomplete", "serp/google/autocomplete/live/advanced", { keyword, ...location, client: "gws-wiz-serp" }, .003, keyword); break;
    case "countries": for (const target of clean.domains) add("labsDomainCountries", "dataforseo_labs/google/domain_rank_overview/live", { target, limit: 1000 }, .15, target); notes.push("Country and language rows are separate provider markets. They must not be summed as unique visitors."); break;
    case "footprint": for (const target of clean.domains) {
      const escaped = (clean.path ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const filters = clean.path ? clean.pathMode === "folder" ? ["ranked_serp_element.serp_item.relative_url", "regex", `^${escaped.replace(/\/$/, "")}(?:/|$)`] : ["ranked_serp_element.serp_item.relative_url", "=", clean.path] : undefined;
      add("labsRankedKeywords", "dataforseo_labs/google/ranked_keywords/live", { target, ...location, limit: 1000, item_types: ["organic"], order_by: ["keyword_data.keyword_info.search_volume,desc"], ...(filters ? { filters } : {}) }, .15, `${target}${clean.path ?? ""}`);
      units.at(-1)!.maxRows = clean.maxRows ?? 1000;
      if (!clean.path) add("labsRelevantPages", "dataforseo_labs/google/relevant_pages/live", { target, ...location, limit: 100 }, .04, target);
    } break;
    case "history": for (const target of clean.domains) add("labsHistoricalRankOverview", "dataforseo_labs/google/historical_rank_overview/live", { target, ...location, date_from: date(historyStart), date_to: date(historyEnd), correlate: true, include_clickstream_data: false }, .15, target); break;
    case "links": for (const target of clean.domains) add("backlinksList", "backlinks/backlinks/live", { target, limit: 1000, mode: "as_is", order_by: ["rank,desc"] }, .07, target); break;
    case "recovery": add("backlinksBrokenPages", "backlinks/domain_pages_summary/live", { target: site.host, limit: 1000, filters: ["broken_pages", ">", 0], order_by: ["backlinks,desc"], backlinks_status_type: "live" }, .07, site.host); break;
    case "clusters": case "questions": for (const keyword of clean.keywords) add("researchSerp", "serp/google/organic/live/advanced", { keyword, ...location, device: clean.device, depth: 10 }, .003, keyword); break;
    case "mentions": for (const domain of clean.domains) add("aiMentions", "ai_optimization/llm_mentions/search/live", { target: [{ domain, search_filter: "include", search_scope: ["sources"], include_subdomains: true }], ...location, platform: clean.platform, limit: 100 }, .22, domain); break;
    case "demand": add("aiKeywordDemand", "ai_optimization/ai_keyword_data/keywords_search_volume/live", { keywords: clean.keywords, ...location }, .01 + clean.keywords.length * .0001, "AI demand"); break;
    case "trends": {
      const start = new Date(now); start.setUTCFullYear(start.getUTCFullYear() - 2);
      const end = new Date(now.getTime() - 86400000);
      for (let i = 0; i < clean.keywords.length; i += 5) add("searchTrends", "keywords_data/dataforseo_trends/explore/live", { keywords: clean.keywords.slice(i, i + 5), location_code: location.location_code, type: "web", date_from: date(start), date_to: date(end) }, .03, `Interest batch ${i / 5 + 1}`);
      notes.push("Trends are country-level relative interest. Compare within each batch, not absolute volumes between batches."); break;
    }
    case "reviews": {
      if (!clean.businessId || !hasDatabase()) throw new Error("Choose a saved local business with a verified Place ID or CID.");
      const [business] = await db().select().from(schema.localSeoLocations).where(and(eq(schema.localSeoLocations.siteSlug, site.id), eq(schema.localSeoLocations.id, clean.businessId)));
      if (!business || !(business.placeId || business.cid)) throw new Error("Save this business's Place ID or CID in Local SEO before collecting reviews.");
      add("googleReviews", "business_data/google/reviews/task_post", { ...(business.placeId ? { place_id: business.placeId } : { cid: business.cid }), ...location, depth: 100, sort_by: "newest", priority: 2 }, .02, business.name, "reviews");
      notes.push("Collects up to 100 newest reviews, including text and owner replies. Older reviews remain outside this sample."); break;
    }
  }
  return { input: clean, market: { locationCode: location.location_code, languageCode: location.language_code, label: input.market?.label ?? site.primaryMarket }, units, estimateUsd: Math.round(units.reduce((sum, unit) => sum + unit.estimateUsd * Math.ceil((unit.maxRows ?? 1000) / 1000), 0) * 1000000) / 1000000, notes };
}
