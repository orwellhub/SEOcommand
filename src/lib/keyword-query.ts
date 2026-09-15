import { z } from "zod";
import { EMPTY_KEYWORD_FILTERS, keywordWords, type KeywordFilters } from "./keyword-workbench";

const range = z.string().max(20).refine(value => value === "" || Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a positive number or leave the filter empty.");
export const KeywordQuerySchema = z.object({
  match: z.enum(["all", "broad", "phrase", "exact", "related"]).default("all"),
  questions: z.boolean().default(false),
  include: z.string().max(300).default(""), exclude: z.string().max(300).default(""),
  intent: z.enum(["", "informational", "navigational", "commercial", "transactional"]).default(""),
  minVolume: range.default(""), maxVolume: range.default(""),
  minDifficulty: range.default(""), maxDifficulty: range.default(""),
  minCpc: range.default(""), maxCpc: range.default(""),
  minWords: range.default(""), maxWords: range.default(""),
  minCompetition: range.default(""), maxCompetition: range.default(""),
  serpFeature: z.string().regex(/^[a-z_]*$/).max(60).default(""),
  market: z.string().max(30).default(""), group: z.array(z.string().min(1).max(80)).max(4).default([]),
  sort: z.enum(["volume", "keyword", "difficulty", "cpc", "competition", "intent", "updated", "results"]).default("volume"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).superRefine((value, ctx) => {
  for (const [min, max, ceiling] of [["minVolume", "maxVolume", Infinity], ["minDifficulty", "maxDifficulty", 100], ["minCpc", "maxCpc", Infinity], ["minWords", "maxWords", 100], ["minCompetition", "maxCompetition", 1]] as const) {
    if (value[min] && value[max] && Number(value[min]) > Number(value[max])) ctx.addIssue({code:"custom", path:[min], message:"The minimum must not exceed the maximum."});
    if (Number(value[min]) > ceiling || Number(value[max]) > ceiling) ctx.addIssue({code:"custom", path:[max], message:`This filter cannot exceed ${ceiling}.`});
  }
});
export type KeywordQuery = z.infer<typeof KeywordQuerySchema>;
export const DEFAULT_KEYWORD_QUERY: KeywordQuery = KeywordQuerySchema.parse({...EMPTY_KEYWORD_FILTERS, sort:"volume", direction:"desc"});
export function queryFromFilters(filters: KeywordFilters, query?: KeywordQuery): KeywordQuery {
  return KeywordQuerySchema.parse({...DEFAULT_KEYWORD_QUERY, ...query, ...filters});
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const terms = (value: string) => value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const wordPattern = (value: string) => `(^|[^\\p{L}\\p{N}])${escapeRegex(value)}([^\\p{L}\\p{N}]|$)`;
export const QUESTION_PATTERN = "^(who|what|when|where|why|how|which|can|could|should|is|are|do|does|will|would)\\b|\\?";
type Clause = [string, string, string | number | string[]];

/** Filters run in Labs before limit/offset. Never accept raw provider expressions from clients. */
export function providerKeywordQuery(seed: string, query: KeywordQuery, nested = false, language = "en") {
  const prefix = nested ? "keyword_data." : "";
  const clauses: Clause[] = [];
  // Labs consumes one escape layer before RE2 (a single \b becomes backspace).
  // Keep our patterns standard and encode that extra layer only at the API boundary.
  const add = (field: string, operator: string, value: Clause[2]) => clauses.push([prefix + field, operator, typeof value === "string" && (operator === "regex" || operator === "not_regex") ? value.replace(/\\/g, "\\\\") : value]);
  if (query.match === "phrase") for (const term of new Set(keywordWords(seed))) add("keyword", "regex", wordPattern(term));
  if (query.questions) {
    const patterns: Record<string,string> = {en:QUESTION_PATTERN, ar:"^(كيف|ما|ماذا|متى|أين|اين|من|لماذا|هل|كم) |[؟?]", fr:"^(comment|pourquoi|quand|où|ou|quel|quelle|combien|est-ce)\\b|\\?", es:"^(cómo|como|qué|que|cuándo|cuando|dónde|donde|cuánto|cuanto|por qué)\\b|[¿?]", de:"^(wie|was|wann|wo|wer|warum|welche|kann|ist)\\b|\\?"};
    const pattern = patterns[language];
    if (!pattern) throw new Error("Question matching currently supports English, Arabic, French, Spanish and German. Use Include keywords to search question phrases in another language.");
    add("keyword", "regex", pattern);
  }
  for (const term of terms(query.include)) add("keyword", "ilike", `%${term.replace(/[%_]/g, "\\$&")}%`);
  if (terms(query.exclude).length) add("keyword", "not_regex", terms(query.exclude).map(escapeRegex).join("|"));
  for (const term of query.group) add("keyword", "regex", wordPattern(term));
  if (query.intent) add("search_intent_info.main_intent", "=", query.intent);
  if (query.serpFeature) add("serp_info.serp_item_types", "has", query.serpFeature);
  for (const [field, min, max] of [
    ["keyword_info.search_volume", query.minVolume, query.maxVolume],
    ["keyword_properties.keyword_difficulty", query.minDifficulty, query.maxDifficulty],
    ["keyword_info.cpc", query.minCpc, query.maxCpc],
    ["keyword_info.competition", query.minCompetition, query.maxCompetition],
  ]) {
    if (min !== "") add(field, ">=", Number(min));
    if (max !== "") add(field, "<=", Number(max));
  }
  if (query.minWords || query.maxWords) {
    const min = Math.max(1, Math.floor(Number(query.minWords) || 1)), max = query.maxWords ? Math.floor(Number(query.maxWords)) : null;
    add("keyword", "regex", max === 0 ? "^$" : `^\\s*\\S+(\\s+\\S+){${min - 1},${max == null ? "" : max - 1}}\\s*$`);
  }
  if (clauses.length > 8) throw new Error("DataForSEO supports eight conditions per search. Remove a condition or a group level before applying these filters.");
  const fields = {keyword:"keyword", volume:"keyword_info.search_volume", difficulty:"keyword_properties.keyword_difficulty", cpc:"keyword_info.cpc", competition:"keyword_info.competition", intent:"search_intent_info.main_intent", updated:"keyword_info.last_updated_time", results:"serp_info.se_results_count"};
  return {
    ...(clauses.length ? {filters: clauses.length === 1 ? clauses[0] : clauses.flatMap((clause, i) => i ? ["and", clause] : [clause])} : {}),
    order_by: [`${prefix}${fields[query.sort]},${query.direction}`, ...(query.sort === "keyword" ? [] : [`${prefix}keyword,asc`])],
  };
}

/** A link must carry the query together with the country/language; cards cannot share an unfiltered URL. */
export function keywordReportHref(base: URLSearchParams, seed: string, location: number, label: string, language: string, query: KeywordQuery, view = "discover") {
  const next = new URLSearchParams(base);
  next.set("q", seed); next.set("location", String(location)); next.set("locationLabel", label); next.set("language", language);
  next.set("view", view); next.set("filters", JSON.stringify(query));
  next.delete("keywords"); next.delete("action");
  return `/keyword-research?${next}`;
}
