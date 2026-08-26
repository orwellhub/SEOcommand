# Orwell SEO Command Centre

A multi-brand, portfolio-first SEO intelligence platform — an original alternative to
the parts of Semrush that matter to a company operating several websites. Monitor and
operate SEO across many domains from one place: rankings, site audits, backlinks, AI
visibility, content, recommendations, tasks and reports.

> **This platform runs exclusively on live data.** A scheduled sync engine pulls
> DataForSEO (keywords, rankings, backlinks, competitors, crawls, AI checks) and
> first-party Google data (Search Console + GA4) into a Postgres snapshot store; the
> dashboard reads those snapshots. Surfaces that have not synced yet say **"Awaiting
> first sync"** — nothing is ever fabricated.

The original 12-site portfolio remains available as a compatibility registry. New sites
are database-managed through `/sites/new`; the operational model, batching and UI are
designed for 300+ websites without another registry rebuild.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript** (strict)
- **Tailwind CSS** with a deliberate design-token + component layer ("Portfolio Atlas")
- **Recharts** + dependency-free SVG sparklines
- **Drizzle ORM** + **PostgreSQL** (snapshot store + production data model)
- **Zod** for input / provider-response validation
- **Vitest** for unit tests
- Deployed on **Render** (web service + managed Postgres + cron worker) — see `render.yaml`

## Quick start

```bash
npm install
npm run db:migrate
npm run dev          # http://localhost:3000  → redirects to /portfolio
```

Configure `AUTH_SECRET`, an internal user and `DATABASE_URL` before starting the app.
Without provider credentials, authenticated surfaces show their "awaiting first sync"
state. With provider credentials configured, `npm run jobs` populates live snapshots.

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # next lint
npm run test         # vitest
```

## What's in the box

| Module | Route | Live data source |
| --- | --- | --- |
| Portfolio | `/portfolio` | GSC clicks + GA4 sessions/conversions + health/authority aggregates per domain |
| Websites | `/sites` | Database registry, lifecycle, connections and per-site provider approval |
| Add website | `/sites/new` | Google discovery, market/devices, GitHub/Hostinger/webhook, alerts and cost approval |
| Domain overview | `/domain` | GSC totals & 90-day trend, GA4 overview, top pages, movers, competitors, crawl snapshot |
| Research | `/research` | Ranked keywords, GSC queries, competitors, keyword gaps and striking-distance |
| Rankings | `/rankings` | Approved daily exact SERP checks, history, position distribution and alerts |
| Site Audit | `/site-audit` | Up to 100k-page OnPage crawl with URL-level metadata/check exploration |
| Backlinks | `/backlinks` | Current link ledger, history from 2019, new/lost data, anchors and risk |
| AI Visibility | `/ai-visibility` | Independent ChatGPT, Claude, Gemini and Perplexity checks |
| Notifications | `/notifications` | In-app ranking, technical, traffic and backlink alerts |
| Content | `/content` | Page-level GSC performance: inventory, measured decay/rise, GA4 landing pages |
| Recommendations | `/recommendations` | Derived at sync time from measured signals; human-approval task flow |
| Reports | `/reports` | Live previews, CSV/PDF export, persisted schedules and signed delivery webhook |
| Settings | `/settings` | Real connection probes, live spend vs the **$200/month guardrail**, sync schedule |

## Architecture at a glance

```
src/
  app/(app)/…            Route modules (client pages) + app shell
  app/api/               auth, protected read-models, workflow, reports, sync, health and usage
  components/            shell (rail/nav/context), ui (tables, drawers, badges), charts
  data/                  Compatibility registry, report templates and benchmark inputs
  platform/              Site registry, forecasts, jobs, observations, alerts and delivery
  providers/
    dataforseo/          Live client: Basic auth, $200/mo SpendGuard, retry/backoff, OnPage resume
    google/              GSC + GA4 REST adapters (headless service-account auth)
  sync/                  engine (collectors), store (snapshot persistence), bundle (read-models)
  db/                    Snapshots, spend ledger, workflow items and report schedules
  lib/                   Canonical types, live-bundle contract, scoring, client data hooks
scripts/                 jobs.ts (cron sync runner), seed.ts (org/domain bootstrap)
```

Data flow: **cron (daily 06:00 UTC) → sync engine → provider APIs → canonical snapshots
in Postgres → `/api/live/*` → dashboard**. Full detail in [`docs/architecture.md`](docs/architecture.md).

## Roles & auth

The internal deployment uses signed, 12-hour HTTP-only sessions. Configure a single
`AUTH_EMAIL`/`AUTH_PASSWORD` account or multiple `AUTH_USERS_JSON` users. Roles are
`admin`, `manager`, `seo_analyst` and `viewer`; mutation APIs reject viewer writes. All
dashboard and live-data APIs are protected, while `/api/sync` keeps its independent
`SYNC_TOKEN` bearer boundary for automation.

## Operations

1. Secrets live in Render env vars (never in git): DataForSEO login/password, Google
   service-account JSON, `SYNC_TOKEN`.
2. Migrations apply automatically on deploy (`preDeployCommand: npm run db:migrate`).
3. The **orwell-jobs** cron runs free Google data and approved exact rankings daily,
   competitor/backlink datasets weekly, and full crawl/AI datasets monthly. It also
   resumes the onboarding queue and sends notification/report webhooks. Use its "Trigger Run" button for an on-demand
   populate, or `POST /api/sync` with `Authorization: Bearer $SYNC_TOKEN`.
4. Health probes: `GET /api/health/dataforseo`, `GET /api/health/google`; spend:
   `GET /api/usage`.

## Site-level cost approval

Every database-managed site receives a conservative monthly forecast before launch.
Approval records an upper monthly ceiling and queues the first scan. The DataForSEO
client checks this site ceiling before every paid request, then applies the portfolio
guardrail and records actual returned cost. Revoked, rejected or exhausted sites cannot
spend. Legacy registry sites retain the existing portfolio guard until migrated.

Website connections store metadata and secret references only. GitHub, Hostinger Git and
generic webhooks operate in `review_only` mode: SEOcommand may create a draft change
proposal or pull-request handoff, but never auto-publishes a website change.

See [`docs/dataforseo-integration.md`](docs/dataforseo-integration.md),
[`docs/google-integration.md`](docs/google-integration.md) (Search Console + GA4),
[`docs/live-connection-plan.md`](docs/live-connection-plan.md) and
[`docs/cost-controls.md`](docs/cost-controls.md).

## Deployment

Hosting decision and rationale: [`docs/deployment-decision.md`](docs/deployment-decision.md)
(short version: this is a server app with a database, server-side secrets and scheduled
jobs, so it targets **Render**, not static Hostinger hosting). The `render.yaml` Blueprint
provisions everything; a step-by-step operator prompt is in
[`docs/browser-prompt-render.md`](docs/browser-prompt-render.md).

## Documentation

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/data-model.md`](docs/data-model.md)
- [`docs/provider-contracts.md`](docs/provider-contracts.md)
- [`docs/scoring-methodology.md`](docs/scoring-methodology.md)
- [`docs/live-connection-plan.md`](docs/live-connection-plan.md)
- [`docs/cost-controls.md`](docs/cost-controls.md)
- [`docs/deployment-decision.md`](docs/deployment-decision.md)
- [`docs/browser-prompt-render.md`](docs/browser-prompt-render.md) — operator prompt to configure Render
- [`docs/browser-prompt-dataforseo.md`](docs/browser-prompt-dataforseo.md) — operator prompt to configure DataForSEO
- [`docs/repository-governance.md`](docs/repository-governance.md) — branch protection and review policy
