# DataForSEO integration

The live DataForSEO adapter is implemented. This document is the operator/engineer
reference for how it works and how to switch the app from demo to live.

## What was built

```
src/providers/dataforseo/
  config.ts        env config, Basic-auth header, location map, endpoint + cost tables
  errors.ts        typed errors + status classifier (20000 ok / 40203 daily-limit / error)
  cost.ts          SpendGuard + in-memory store (the app-owned monthly $200 guardrail)
  store-db.ts      durable Postgres spend store (provider_spend table)
  client.ts        Basic-auth HTTP client: envelope parse, retry/backoff, OnPage polling
  normalizers.ts   raw DataForSEO rows → canonical models (defensive)
  index.ts         composed SeoProvider + probeDataForSeo() health check
```

API routes:
- `GET /api/health/dataforseo` — verifies credentials (zero-cost models call) and returns
  the monthly-spend guardrail status. Reports `configured: false` in demo mode.
- `GET /api/usage` — month-to-date spend vs the $200 ceiling (feeds the Settings meter).

## Authentication

HTTP Basic auth: `Authorization: Basic base64(DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD)`.
Credentials are read server-side only (`config.ts`) and never reach the browser bundle.

## The monthly spending guardrail (app-owned)

DataForSEO has **no native monthly cap**, so the app enforces the $200/month ceiling:

- Every DataForSEO call goes through `SpendGuard.run()` inside the client.
- **Before** the call: it sums month-to-date spend and blocks with `BudgetExceededError`
  if the pre-flight estimate would breach the limit (non-critical jobs are also paused once
  fully spent; critical jobs may run up to the hard limit).
- **After** the call: it records the **actual** `cost` DataForSEO returns to the
  `provider_spend` table (durable across restarts when `DATABASE_URL` is set; in-memory
  otherwise).
- Alert thresholds at 50 / 75 / 90 / 100% are surfaced via `/api/usage` and `SpendGuard.status()`.
- Recommended secondary backstop: enable DataForSEO's own email spend-threshold alert
  (e.g. notify at 80%) on the account side.

Month-to-date spend = `SUM(cost_usd)` in `provider_spend` for the current `YYYY-MM` (UTC).

## Endpoints & verification status

Operator-verified (returned status 20000 on this account):
`serp/google/organic/live/advanced`, `dataforseo_labs/google/domain_rank_overview/live`,
`backlinks/summary/live`, `keywords_data/google_ads/search_volume/live`,
`on_page/task_post` + `on_page/summary/{id}`, `ai_optimization/chat_gpt/llm_responses/live`.

Also used (direct siblings on the same verified APIs — verify field paths against live
payloads on first run): `dataforseo_labs/.../ranked_keywords/live`,
`.../competitors_domain/live`, `backlinks/backlinks/live`, `backlinks/referring_domains/live`.

Location/language codes (`config.ts`): UAE `2784`/`en`, UK `2826`/`en` (EU cities + route
countries to be added).

## Error handling

- `40203` (daily limit) → `DailyLimitError`; jobs pause gracefully and report it.
- Any non-`20000` top-level or per-task status → `DataForSeoError` (message only, no payload).
- Transient HTTP (429/5xx) → retried up to 4× with exponential backoff (2s/4s/8s/16s).
- OnPage is async: `task_post` → poll `summary/{id}` until `crawl_progress === "finished"`
  (or timeout). Summary polling is treated as zero-cost.

## Going live — checklist

1. In Render, set on **orwell-web** and **orwell-jobs** (secrets, never committed):
   `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `DATAFORSEO_BASE_URL=https://api.dataforseo.com`.
2. Ensure `DATABASE_URL` is present (Blueprint wires it) and run `npm run db:migrate`
   so `provider_spend` exists (migration `drizzle/0001_*`).
3. Deploy, then hit `GET /api/health/dataforseo` — expect `configured: true` with a spend
   block and a positive `models` count. Fix credentials if it reports an error.
4. Flip `SEO_PROVIDER=dataforseo` **and** `NEXT_PUBLIC_SEO_PROVIDER=dataforseo`.
5. The cron worker's daily jobs (`tracked-keyword-collection`, `backlink-changes`,
   `competitor-refresh`, `technical-crawl`, `ai-prompt-checks`) now fetch live data under
   the guardrail. Watch `/api/usage` and the logs.

## Remaining (optional) work

- The demo UI pages still read the seed modules directly for an instant walkthrough. To
  render live data in the pages, fetch through server route handlers that call
  `getSeoProvider()` (the adapter and provenance are ready). `keywordLists` and `content`
  return empty envelopes live until Labs `relevant_pages` mapping is added — they never
  fabricate data.
