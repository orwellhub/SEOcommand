#!/usr/bin/env node
/**
 * Multi-market Google Ads search volume pull via DataForSEO.
 *
 * v2: reads data/keyword-seeds/manifest.json and runs one live task per
 * market. The legacy SEEDS_FILE and LOCATION_CODE environment variables set
 * by the workflow are intentionally ignored; the manifest is authoritative.
 *
 * Still dependency-free: global fetch (Node 18+), nothing from src/.
 * Auth matches src/providers/dataforseo/config.ts:
 *   Authorization: Basic base64(DATAFORSEO_LOGIN + ":" + DATAFORSEO_PASSWORD)
 * The login is the account email address; the password is the generated API
 * password. DATAFORSEO_BASE_URL is the API host, not a credential.
 *
 * NOTE: bypasses src/providers/dataforseo, so spend is NOT recorded in the
 * api_cost table and does NOT count against MONTHLY_BUDGET_USD. Cost per run
 * is printed to the job log. Credentials are never logged.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";

const ENDPOINT = "/v3/keywords_data/google_ads/search_volume/live";
const BASE_URL = process.env.DATAFORSEO_BASE_URL || "https://api.dataforseo.com";
const MANIFEST = "data/keyword-seeds/manifest.json";
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
    "Add them as repository secrets under Settings > Secrets and variables > Actions.",
    "Do not add DATAFORSEO_BASE_URL; it is the API host, not a credential.",
  ]);
}

if (/^https?:\/\//i.test(login)) {
  die([
    "DATAFORSEO_LOGIN looks like a URL, which means the base URL was pasted",
    "into the login slot. The login is the account email address and the",
    "password is the generated API password from the dashboard.",
  ]);
}

if (!login.includes("@")) {
  console.warn(
    `  Warning: DATAFORSEO_LOGIN does not contain "@". The API login is normally\n` +
      `  the account email address. Continuing, but a 401 means this is why.\n`
  );
}

const auth = Buffer.from(`${login}:${password}`).toString("base64");
const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
await mkdir(OUT_DIR, { recursive: true });

const esc = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADER = [
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

let totalCost = 0;
const summary = [];

for (const job of manifest.jobs) {
  const seedDoc = JSON.parse(await readFile(job.seeds, "utf8"));
  const locationCode = Number(job.location_code);
  const languageCode = job.language_code || "en";

  const seen = new Set();
  const keywords = [];
  for (const row of seedDoc.keywords) {
    const k = row.keyword.trim().toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      keywords.push(k);
    }
  }

  console.log(`\n=== ${job.market} (${locationCode}) ===`);
  console.log(`Seeds    : ${job.seeds}`);
  console.log(`Keywords : ${keywords.length} unique of ${seedDoc.keywords.length} rows`);

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
    die([`Network failure reaching DataForSEO for ${job.market}: ${err.message}`]);
  }

  if (res.status === 401) {
    die([
      "401 Unauthorised from DataForSEO.",
      "The login must be the account email and the password the generated API",
      "password from the dashboard, not the sign-in password.",
    ]);
  }
  if (!res.ok) {
    die([`HTTP ${res.status} ${res.statusText} from DataForSEO for ${job.market}.`]);
  }

  const payload = await res.json();
  if (payload.status_code !== 20000) {
    die([`API status ${payload.status_code}: ${payload.status_message}`]);
  }
  const task = payload.tasks && payload.tasks[0];
  if (!task || task.status_code !== 20000) {
    die([`Task status ${task && task.status_code}: ${task && task.status_message}`]);
  }

  const results = task.result || [];
  totalCost += payload.cost || 0;
  console.log(`Returned : ${results.length} rows`);
  console.log(`Cost     : $${payload.cost ?? 0}`);

  const byKeyword = new Map(results.map((r) => [r.keyword, r]));

  const rows = seedDoc.keywords.map((seed) => {
    const r = byKeyword.get(seed.keyword.trim().toLowerCase());
    const trend =
      r && r.monthly_searches
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

  const withVol = rows.filter((r) => (r.search_volume || 0) > 0);
  const vTier = rows.filter((r) => r.tier === "V");
  const vWithVol = vTier.filter((r) => (r.search_volume || 0) > 0);
  console.log(`With volume : ${withVol.length} of ${rows.length}`);
  console.log(`Vendor tier : ${vWithVol.length} of ${vTier.length} with volume`);
  summary.push({
    market: job.market,
    location_code: locationCode,
    rows: rows.length,
    with_volume: withVol.length,
    vendor_with_volume: vWithVol.length,
    vendor_total: vTier.length,
  });

  await writeFile(
    `${OUT_DIR}/results-${locationCode}.json`,
    JSON.stringify(
      {
        pulled_at: new Date().toISOString(),
        market: job.market,
        location_code: locationCode,
        language_code: languageCode,
        endpoint: ENDPOINT,
        currency: "USD",
        cost_usd: payload.cost ?? 0,
        keyword_count: keywords.length,
        rows,
      },
      null,
      2
    ) + "\n"
  );

  const csv = [
    HEADER.join(","),
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
  console.log(`Wrote ${OUT_DIR}/results-${locationCode}.json and .csv`);
}

await writeFile(
  `${OUT_DIR}/run-summary.json`,
  JSON.stringify(
    { pulled_at: new Date().toISOString(), total_cost_usd: totalCost, jobs: summary },
    null,
    2
  ) + "\n"
);
console.log(`\nTotal cost this run: $${totalCost}`);
