# Cost controls

DataForSEO is usage-based, so cost control is a first-class product feature, not an
afterthought. The demo ships with a **$200/month guardrail and $0 actual spend**.

## Guardrails (Settings → API usage & spending guardrails)

- **Global monthly limit** — default **$200** (`MONTHLY_BUDGET_USD`). Rendered as a live
  usage meter.
- **Per-domain budgets** — the global cap is split into per-domain sub-budgets so one
  brand cannot exhaust the portfolio's allowance.
- **Per-provider usage ledger** — every request's provider, module, domain, count and cost
  is recorded (`api_usage_ledger` in production; `SEED.usageLedger` in demo).
- **Threshold alerts** — at **50%, 75%, 90% and 100%** of any budget.
- **Emergency pause** — a switch that halts all non-critical scheduled jobs.

## Request efficiency

- **Estimated cost before large requests** — expensive research actions show an estimate
  before running.
- **Request modes** — `normal`, `priority`, `live` (where a provider supports it), trading
  freshness against cost.
- **Caching & deduplication** — repeated identical queries are served from cache within
  the retention window; in-flight duplicates are coalesced.
- **Batching** — keyword/SERP/backlink lookups are batched to minimise request count.
- **Retry limits + exponential backoff** — failed calls retry a bounded number of times
  (2s, 4s, 8s, 16s) to avoid runaway spend on transient errors.

## Enforcement points

1. **Scheduler** (`scripts/jobs.ts`) — before running, each job checks remaining budget and
   aborts non-critical work when over 100%.
2. **Provider adapter** — wraps calls with cache lookup, dedupe, batch and backoff, and
   appends to the usage ledger on every real request.
3. **UI** — surfaces the meters, thresholds and the estimate-before-run affordance.

## Tracking policy — split cadence (cost-optimised)

Google is free per call; DataForSEO is the entire cost. The scheduled runner
(`scripts/jobs.ts` → `scheduledTiers`) therefore separates them:

| Tier | Datasets | Cost | Cadence |
| --- | --- | --- | --- |
| `google` | GSC clicks/impressions/position/queries/pages/movers, GA4 sessions/conversions/landing pages | **free** | **daily** |
| `dfsLight` | ranked keywords, rankings, position buckets, competitors, backlinks, referring domains | paid | **weekly** (Mondays) |
| `dfsHeavy` | OnPage crawls + AI-visibility checks | paid (priciest) | **monthly** (1st) |

Pending OnPage crawls are polled for free on the daily runs, so a monthly crawl
still finishes within a day or two. One daily cron drives all three cadences by
date; env overrides (`SYNC_GOOGLE=0`, `SYNC_DFS_LIGHT=1`, `SYNC_DFS_HEAVY=1`)
force a tier for a single run.

Approximate cost: free daily Google + weekly light + monthly heavy ≈ **$10–15/month**
against the $200 guardrail. A full every-day pull would be ~$100–110/month.

## Manual / on-demand pulls

`POST /api/sync` (bearer `SYNC_TOKEN`) is a deliberate FULL pull by default:

- `POST /api/sync` — full portfolio pull (all tiers)
- `POST /api/sync?domain=<id>` — one property, full pull (per-property refresh)
- `POST /api/sync?domain=<id>&tier=light` — one property, no crawl/AI (cheaper)
- `POST /api/sync?tier=google` — free GSC/GA4 refresh only

Actual spend per property and per endpoint is available at `GET /api/usage/breakdown`.
