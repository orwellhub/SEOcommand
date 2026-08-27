import { NextResponse } from "next/server";
import { ENDPOINTS } from "@/providers/dataforseo/config";
import { dataForSeoConfigured, getDataForSeoClient } from "@/providers/dataforseo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface SearchLocation {
  code: number;
  name: string;
  parent: string | null;
  countryCode: string | null;
  type: string;
  language: string;
}

const FALLBACK: SearchLocation[] = [
  [2784,"United Arab Emirates","AE"],[2682,"Saudi Arabia","SA"],[2634,"Qatar","QA"],[2826,"United Kingdom","GB"],[2840,"United States","US"],[2036,"Australia","AU"],[2124,"Canada","CA"],[2276,"Germany","DE"],[2250,"France","FR"],[2380,"Italy","IT"],[2724,"Spain","ES"],[2528,"Netherlands","NL"],[2356,"India","IN"],[2702,"Singapore","SG"],[2344,"Hong Kong","HK"],[2392,"Japan","JP"],[2410,"South Korea","KR"],[2076,"Brazil","BR"],[2484,"Mexico","MX"],[2710,"South Africa","ZA"],[2554,"New Zealand","NZ"],[2792,"Türkiye","TR"],[2616,"Poland","PL"],[2752,"Sweden","SE"],[2578,"Norway","NO"],
].map(([code, name, country]) => ({ code: Number(code), name: String(name), parent: null, countryCode: String(country), type: "Country", language: "en" }));

let cache: { expires: number; rows: SearchLocation[] } | null = null;

function normalize(row: Record<string, unknown>): SearchLocation | null {
  const code = Number(row.location_code);
  const name = typeof row.location_name === "string" ? row.location_name : null;
  if (!Number.isInteger(code) || code <= 0 || !name) return null;
  return {
    code,
    name,
    parent: typeof row.location_name_parent === "string" ? row.location_name_parent : null,
    countryCode: typeof row.country_iso_code === "string" ? row.country_iso_code : null,
    type: typeof row.location_type === "string" ? row.location_type : "Location",
    language: typeof row.language_code === "string" ? row.language_code : "en",
  };
}

async function locations() {
  if (process.env.QA_SYNTHETIC === "true" || !dataForSeoConfigured()) return FALLBACK;
  if (cache && cache.expires > Date.now()) return cache.rows;
  const raw = await getDataForSeoClient().getMeta<Record<string, unknown>>(ENDPOINTS.serpGoogleLocations);
  const rows = raw.map(normalize).filter((row): row is SearchLocation => row !== null);
  cache = { rows: rows.length ? rows : FALLBACK, expires: Date.now() + 24 * 60 * 60 * 1_000 };
  return cache.rows;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(params.get("limit")) || 30, 1), 100);
  try {
    const rows = await locations();
    const filtered = query ? rows.filter((row) => `${row.name} ${row.parent ?? ""} ${row.countryCode ?? ""}`.toLowerCase().includes(query)) : rows;
    return NextResponse.json({ ok: true, locations: filtered.slice(0, limit), configured: dataForSeoConfigured(), worldwide: true });
  } catch (error) {
    const filtered = query ? FALLBACK.filter((row) => row.name.toLowerCase().includes(query)) : FALLBACK;
    return NextResponse.json({ ok: true, locations: filtered.slice(0, limit), configured: false, worldwide: false, warning: error instanceof Error ? error.message : "Location catalogue unavailable." });
  }
}
