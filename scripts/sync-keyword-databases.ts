/**
 * Refresh the bundled DataForSEO Labs keyword-database catalogue.
 *
 * The Keyword Magic Tool may only scan locations that DataForSEO Labs
 * publishes as keyword databases. That catalogue is a free, credential-less
 * CSV on DataForSEO's CDN, so this script can run in CI without touching the
 * billed API or the SpendGuard budget.
 *
 *   npm run sync:keyword-databases -- [YYYY_MM_DD]
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CDN = "https://cdn.dataforseo.com/v3/locations";
const OUTPUT = fileURLToPath(new URL("../src/lib/dataforseo-keyword-databases.json", import.meta.url));

/** Minimal RFC 4180 reader: `available_sources` arrives as a quoted, comma-joined field. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') value += char;
      else if (text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value); rows.push(row); row = []; value = ""; }
    else if (char !== "\r") value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim()));
  return body.map((entry) => Object.fromEntries(header.map((key, index) => [key.trim(), (entry[index] ?? "").trim()])));
}

/** Most recent catalogue wins; DataForSEO only keeps the current month published. */
async function fetchCatalogue(explicit?: string): Promise<{ version: string; csv: string }> {
  const now = new Date();
  const candidates = explicit
    ? [explicit]
    : Array.from({ length: 13 }, (_, back) => {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        return `${date.getUTCFullYear()}_${String(date.getUTCMonth() + 1).padStart(2, "0")}_01`;
      });
  const failures: string[] = [];
  for (const version of candidates) {
    const url = `${CDN}/locations_and_languages_dataforseo_labs_${version}.csv`;
    const response = await fetch(url);
    if (response.ok) return { version, csv: await response.text() };
    failures.push(`${version} → HTTP ${response.status}`);
  }
  throw new Error(`No DataForSEO Labs catalogue could be downloaded (${failures.join(", ")}).`);
}

async function main() {
  const { version, csv } = await fetchCatalogue(process.argv[2]);
  const databases = new Map<number, { code: number; name: string; countryCode: string | null; type: string; languages: { code: string; name: string }[] }>();
  for (const row of parseCsv(csv)) {
    const code = Number(row.location_code);
    if (!Number.isInteger(code) || code <= 0 || !row.location_name) continue;
    // Labs exposes country-level databases only; city/region rows belong to the SERP catalogue.
    if (row.location_code_parent) continue;
    const entry = databases.get(code) ?? {
      code,
      name: row.location_name,
      countryCode: row.country_iso_code || null,
      type: row.location_type || "Country",
      languages: [],
    };
    if (row.language_code && !entry.languages.some((language) => language.code === row.language_code)) {
      entry.languages.push({ code: row.language_code, name: row.language_name || row.language_code });
    }
    databases.set(code, entry);
  }
  if (databases.size < 50) throw new Error(`Catalogue ${version} yielded only ${databases.size} databases; refusing to overwrite.`);
  const payload = {
    version,
    source: `${CDN}/locations_and_languages_dataforseo_labs_${version}.csv`,
    databases: [...databases.values()].sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${payload.databases.length} keyword databases from catalogue ${version}.`);
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
