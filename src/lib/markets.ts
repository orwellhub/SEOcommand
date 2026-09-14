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
