import catalogue from "./dataforseo-keyword-databases.json";

/**
 * SERP markets selectable for a keyword-research scan. Codes are DataForSEO
 * location codes; UAE leads the list as the portfolio's priority market.
 */
export interface Market {
  code: number;
  label: string;
  /** Default language for the market (ISO code DataForSEO expects). */
  language: string;
}

/** A DataForSEO Labs keyword database and the languages it can be scanned in. */
export interface KeywordDatabase {
  code: number;
  name: string;
  countryCode: string | null;
  type: string;
  languages: { code: string; name: string }[];
}

/**
 * Every country database DataForSEO Labs exposes for keyword research, taken
 * verbatim from the published catalogue and refreshed by
 * `npm run sync:keyword-databases`. Labs rejects any other location, so this
 * list is both the menu the Keyword Magic Tool offers and the validation gate.
 */
export const KEYWORD_DATABASES: KeywordDatabase[] = catalogue.databases;

/** Catalogue release the bundled databases were generated from. */
export const KEYWORD_DATABASE_VERSION: string = catalogue.version;

const BY_CODE = new Map(KEYWORD_DATABASES.map((database) => [database.code, database]));
const BY_ISO = new Map(KEYWORD_DATABASES.filter((database) => database.countryCode).map((database) => [database.countryCode!.toUpperCase(), database]));

export const MARKETS: Market[] = [
  { code: 2784, label: "United Arab Emirates", language: "en" },
  { code: 2682, label: "Saudi Arabia", language: "en" },
  { code: 2634, label: "Qatar", language: "en" },
  { code: 2826, label: "United Kingdom", language: "en" },
  { code: 2840, label: "United States", language: "en" },
  { code: 2036, label: "Australia", language: "en" },
  { code: 2124, label: "Canada", language: "en" },
];

/** Priority default market for a new scan (UAE). */
export const DEFAULT_MARKET: Market = MARKETS[0];

export function marketByCode(code: number): Market | undefined {
  return MARKETS.find((m) => m.code === code);
}

export function marketLabel(code: number): string {
  return marketByCode(code)?.label ?? BY_CODE.get(code)?.name ?? `Location ${code}`;
}

/** The Labs database for a location code, when the code is a supported one. */
export function keywordDatabase(code: number): KeywordDatabase | undefined {
  return BY_CODE.get(code);
}

/** Languages DataForSEO Labs can scan a database in; empty when unsupported. */
export function keywordDatabaseLanguages(code: number): { code: string; name: string }[] {
  return BY_CODE.get(code)?.languages ?? [];
}

/**
 * Language a scan should default to for a database. Most databases are not
 * English, so defaulting every market to `en` returns an empty scan.
 */
export function defaultLanguageForMarket(code: number, preferred?: string): string {
  const languages = keywordDatabaseLanguages(code);
  if (!languages.length) return preferred ?? marketByCode(code)?.language ?? "en";
  const supported = (value?: string) => (value && languages.some((language) => language.code === value) ? value : null);
  return supported(preferred) ?? supported(marketByCode(code)?.language) ?? languages[0].code;
}

/** Resolve a clickstream country into the corresponding Labs country database. */
export function marketForIsoCountry(iso: string): { code: number; label: string } | null {
  const database = BY_ISO.get(iso.trim().toUpperCase());
  return database ? { code: database.code, label: database.name } : null;
}

export function isKeywordDatabase(code: number): boolean {
  return BY_CODE.has(code);
}

/** Clickstream includes an unassigned-country bucket, represented as null. */
export function keywordCountryCode(value: unknown): string {
  return typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : "ZZ";
}
