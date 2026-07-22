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

## Tracking policy

- Daily: tracked-keyword collection, GSC/GA4 sync, backlink changes, anomaly detection.
- Weekly: technical crawl, competitor refresh.
- Configurable: AI-prompt checks.

Frequencies are chosen to keep predictable monthly spend well under the guardrail. All
figures in the current build are demo values with zero real spend until a live provider is
connected.
