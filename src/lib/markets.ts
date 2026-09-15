import countryNames from "./dataforseo-country-names.json";

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
  // Official Labs catalogue: https://cdn.dataforseo.com/v3/locations/locations_and_languages_dataforseo_labs_2026_09_01.csv
  return marketByCode(code)?.label ?? (countryNames as Record<string, string>)[String(code)] ?? `Location ${code}`;
}

/** Resolve a clickstream country into the corresponding Labs country database. */
export function marketForIsoCountry(iso: string): {code:number;label:string} | null {
  try {
    const label = new Intl.DisplayNames(["en"], {type:"region"}).of(iso.toUpperCase());
    const aliases: Record<string,string> = {TR:"Turkey",CZ:"Czechia",KR:"South Korea",RU:"Russia",VN:"Vietnam"};
    const target = aliases[iso.toUpperCase()] ?? label;
    const entry = Object.entries(countryNames).find(([,name])=>name === target || name === label);
    return entry ? {code:Number(entry[0]),label:entry[1]} : null;
  } catch { return null; }
}

export function isKeywordDatabase(code: number): boolean { return Object.hasOwn(countryNames, String(code)); }

/** Clickstream includes an unassigned-country bucket, represented as null. */
export function keywordCountryCode(value: unknown): string {
  return typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : "ZZ";
}
