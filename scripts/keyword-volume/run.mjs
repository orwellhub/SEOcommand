#!/usr/bin/env node
/**
 * Standalone Google Ads search volume pull via DataForSEO.
 *
 * Deliberately has no repo dependencies: it uses global fetch (Node 18+) and
 * nothing from src/. That keeps it runnable on a bare Actions runner without
 * installing the application.
 *
 * Auth matches src/providers/dataforseo/config.ts exactly:
 *   Authorization: Basic base64(DATAFORSEO_LOGIN + ":" + DATAFORSEO_PASSWORD)
 * The login is the account email address. The password is the generated API
 * password, not the dashboard sign-in password. DATAFORSEO_BASE_URL is the API
 * host, not a credential.
 *
 * NOTE: because it bypasses src/providers/dataforseo, this run is NOT recorded
 * in the api_cost table and does NOT count against MONTHLY_BUDGET_USD. The cost
 * is printed to the job log instead. One task of ~90 keywords is a few cents.
 *
 * Credentials are read from the environment and never logged.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";

const ENDPOINT = "/v3/keywords_data/google_ads/search_volume/live";
const BASE_URL = process.env.DATAFORSEO_BASE_URL || "https://api.dataforseo.com";
const SEEDS = process.env.SEEDS_FILE || "scripts/keyword-volume/seeds-uk.json";
const OUT_DIR = "data/keyword-volume";

const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;

function die(lines) {
  console.error(["", ...lines.map((l) => `  ${l}`), ""].join("\n"));
  process.exit(1);
}

if (!login || !password) {
  die([
    "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not both set.",
    "",
    "These currently live in Render on orwell-web and orwell-jobs. Copy the",
    "same two values into GitHub Actions repository secrets:",
    "",
    "  Settings > Secrets and variables > Actions > New repository secret",
    "",
    "Do not add DATAFORSEO_BASE_URL. It is the API host, not a credential,",
    "and the workflow already sets it.",
  ]);
}

// Guard against the common mix-up: pasting the base URL into the login slot.
if (/^https?:\/\//i.test(login)) {
  die([
    "DATAFORSEO_LOGIN looks like a URL, so it is almost certainly the base URL.",
    "",
    "The base URL is not a credential. DataForSEO authenticates with:",
    "",
    "  DATAFORSEO_LOGIN    the email address on the DataForSEO account",
    "  DATAFORSEO_PASSWORD the generated API password (not the dashboard one)",
    "",
    "Both are visible in the DataForSEO dashboard under API Access.",
  ]);
}

if (!login.includes("@")) {
  console.warn(
    `  Warning: DATAFORSEO_LOGIN does not contain "@". The API login is normally\n` +
      `  the account email address. Continuing, but a 401 here means this is why.\n`
  );
}

const seedDoc = JSON.parse(await readFile(SEEDS, "utf8"));
const locationCode = Number(process.env.LOCATION_CODE || seedDoc.location_code || 2826);
const languageCode = process.env.LANGUAGE_CODE || seedDoc.language_code || "en";

// Deduplicate for the request while keeping seed order for the output.
const seen = new Set();
const keywords = [];
for (const row of seedDoc.keywords) {
  const k = row.keyword.trim().toLowerCase();
  if (!seen.has(k)) {
    seen.add(k);
    keywords.push(k);
  }
}

console.log(`Market        : ${seedDoc.market || locationCode}`);
console.log(`Location code : ${locationCode}`);
console.log(`Language      : ${languageCode}`);
console.log(`Keywords      : ${keywords.length}`);
console.log(`Endpoint      : ${ENDPOINT}\n`);

const auth = Buffer.from(`${login}:${password}`).toString("base64");

let res;
try {
  res = await fetch(`${BASE_URL}${ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        location_code: locationCode,
        language_code: languageCode,
        search_partners: false,
        sort_by: "search_volume",
        keywords,
      },
    ]),
  });
} catch (err) {
  die([`Network failure reaching DataForSEO: ${err.message}`]);
}

if (res.status === 401) {
  die([
    "401 Unauthorised from DataForSEO.",
    "",
    "The login must be the account email address and the password must be the",
    "generated API password from the dashboard, not the sign-in password.",
  ]);
}

if (!res.ok) {
  die([`HTTP ${res.status} ${res.statusText} from DataForSEO.`]);
}

const payload = await res.json();

// 20000 = ok. 40203 = daily limit reached (see src/providers/dataforseo/errors.ts).
if (payload.status_code !== 20000) {
  die([`API status ${payload.status_code}: ${payload.status_message}`]);
}

const task = payload.tasks && payload.tasks[0];
if (!task || task.status_code !== 20000) {
  die([`Task status ${task && task.status_code}: ${task && task.status_message}`]);
}

const results = task.result || [];
console.log(`Returned      : ${results.length} rows`);
console.log(`Cost          : $${payload.cost ?? 0}\n`);

const byKeyword = new Map(results.map((r) => [r.keyword, r]));

// Rebuild in seed order so output maps straight onto the product catalogue.
const rows = seedDoc.keywords.map((seed) => {
  const r = byKeyword.get(seed.keyword.trim().toLowerCase());
  const trend = r && r.monthly_searches
    ? r.monthly_searches.slice(0, 12).map((m) => m.search_volume)
    : [];
  return {
    product: seed.product,
    tier: seed.tier,
    keyword: seed.keyword,
    search_volume: r ? r.search_volume : null,
    cpc: r ? r.cpc : null,
    competition: r ? r.competition : null,
    competition_index: r ? r.competition_index : null,
    low_top_of_page_bid: r ? r.low_top_of_page_bid : null,
    high_top_of_page_bid: r ? r.high_top_of_page_bid : null,
    trend_12m: trend,
    found: Boolean(r),
  };
});

const missing = rows.filter((r) => !r.found);
const zeroVolume = rows.filter((r) => r.found && !r.search_volume);
const vendorTier = rows.filter((r) => r.tier === "V");
const vendorWithVolume = vendorTier.filter((r) => (r.search_volume || 0) > 0);

console.log(`No data returned       : ${missing.length}`);
console.log(`Zero volume            : ${zeroVolume.length}`);
console.log(`Vendor tier with volume: ${vendorWithVolume.length} of ${vendorTier.length}\n`);

await mkdir(OUT_DIR, { recursive: true });

await writeFile(
  `${OUT_DIR}/results-${locationCode}.json`,
  JSON.stringify(
    {
      pulled_at: new Date().toISOString(),
      market: seedDoc.market || null,
      location_code: locationCode,
      language_code: languageCode,
      endpoint: ENDPOINT,
      cost_usd: payload.cost ?? 0,
      keyword_count: keywords.length,
      rows,
    },
    null,
    2
  ) + "\n"
);

const esc = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const header = [
  "product",
  "tier",
  "keyword",
  "search_volume",
  "cpc",
  "competition",
  "competition_index",
  "low_top_of_page_bid",
  "high_top_of_page_bid",
  "trend_12m",
];

const csv = [
  header.join(","),
  ...rows.map((r) =>
    [
      r.product,
      r.tier,
      r.keyword,
      r.search_volume,
      r.cpc,
      r.competition,
      r.competition_index,
      r.low_top_of_page_bid,
      r.high_top_of_page_bid,
      r.trend_12m.join(" "),
    ]
      .map(esc)
      .join(",")
  ),
].join("\n");

await writeFile(`${OUT_DIR}/results-${locationCode}.csv`, csv + "\n");

console.log(`Wrote ${OUT_DIR}/results-${locationCode}.json`);
console.log(`Wrote ${OUT_DIR}/results-${locationCode}.csv`);
