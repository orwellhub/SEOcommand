# DataForSEO integration

The live DataForSEO adapter is implemented. This document is the operator/engineer
reference for the live adapter and its operating controls.

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
  the monthly-spend guardrail status. Reports `configured: false` when credentials are absent.
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

Location/language codes (`config.ts`) are explicit per domain or provided through
`DATAFORSEO_LOCATION_<DOMAIN_ID>`. Multi-market domains never silently fall back to the
UK; a missing priority market produces a visible sync error.

## Error handling

- `40203` (daily limit) → `DailyLimitError`; jobs pause gracefully and report it.
- Any non-`20000` top-level or per-task status → `DataForSeoError` (message only, no payload).
- Transient HTTP (429/5xx) → retried up to 4× with exponential backoff (2s/4s/8s/16s).
- OnPage is async: `task_post` → poll `summary/{id}` until `crawl_progress === "finished"`
  (or timeout). Summary polling is treated as zero-cost.

## How data flows now

There is no demo mode and no provider "flip". When credentials are present, the sync
engine (`src/sync/engine.ts`) pulls live data and writes canonical snapshots to the
`dataset_snapshots` table; the dashboard reads them via `/api/live/*`. One paid call
feeds every dataset it can (ranked_keywords → keywords + rank snapshots;
domain_rank_overview → visibility + position buckets). OnPage crawls are posted once and
resumed across runs via their stored task id — a slow crawl never blocks or double-pays.

Sync triggers:
- **Daily cron** (orwell-jobs, 06:00 UTC) — Google daily, DataForSEO light datasets on
  Mondays and crawl/AI datasets on the first of each month.
- **On-demand** — the cron's "Trigger Run" button, or `POST /api/sync` with
  `Authorization: Bearer $SYNC_TOKEN` (refused entirely while `SYNC_TOKEN` is unset).
- AI prompt checks run only for domains configured in `src/data/ai-prompts.ts`.

Watch spend at `GET /api/usage`; every DataForSEO call is pre-checked and recorded by the
SpendGuard against the $200/month ceiling.
