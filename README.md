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

Portfolio: 12 domains across UAE finance comparison, transport, pet relocation, US pest
control, UK security and energy-claims brands — registry-driven (`src/data/domains.ts`),
architected for more.

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
npm run dev          # http://localhost:3000  → redirects to /portfolio
```

Without `DATABASE_URL` and provider credentials the app runs and every surface shows its
"awaiting first sync" state. With credentials configured, `npm run jobs` executes a full
sync and the dashboard lights up with live data.

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
| Domain overview | `/domain` | GSC totals & 90-day trend, GA4 overview, top pages, movers, competitors, crawl snapshot |
| Research | `/research` | DataForSEO ranked keywords, real GSC queries, competitors, striking-distance |
| Rankings | `/rankings` | Rank snapshots, position distribution, GSC position trend, measured movers |
| Site Audit | `/site-audit` | OnPage crawl: transparent health score + issues from real check counts |
| Backlinks | `/backlinks` | Backlinks API: links, referring domains, anchors, spam-score risk, **Orwell Authority Score** |
| AI Visibility | `/ai-visibility` | Live LLM checks of tracked prompts (mention/citation, real responses) |
| Content | `/content` | Page-level GSC performance: inventory, measured decay/rise, GA4 landing pages |
| Recommendations | `/recommendations` | Derived at sync time from measured signals; human-approval task flow |
| Reports | `/reports` | Templates populated from live portfolio data |
| Settings | `/settings` | Real connection probes, live spend vs the **$200/month guardrail**, sync schedule |

## Architecture at a glance

```
src/
  app/(app)/…            Route modules (client pages) + app shell
  app/api/               live/[domain] + live/portfolio read-models, sync trigger, health probes, usage
  components/            shell (rail/nav/context), ui (tables, drawers, badges), charts
  data/                  Domain registry, AI prompt tracking config, report templates, benchmark
  providers/
    dataforseo/          Live client: Basic auth, $200/mo SpendGuard, retry/backoff, OnPage resume
    google/              GSC + GA4 REST adapters (headless service-account auth)
  sync/                  engine (collectors), store (snapshot persistence), bundle (read-models)
  db/                    Drizzle schema incl. dataset_snapshots + provider_spend
  lib/                   Canonical types, live-bundle contract, scoring, client data hooks
scripts/                 jobs.ts (cron sync runner), seed.ts (org/domain bootstrap)
```

Data flow: **cron (daily 06:00 UTC) → sync engine → provider APIs → canonical snapshots
in Postgres → `/api/live/*` → dashboard**. Full detail in [`docs/architecture.md`](docs/architecture.md).

## Roles & auth

Prepared roles: `admin`, `manager`, `seo_analyst`, `viewer`, with a demo auth boundary and
no hard-coded secrets. Replace with a real auth provider before opening access beyond the
team (see `AUTH_SECRET` in `.env.example`).

## Operations

1. Secrets live in Render env vars (never in git): DataForSEO login/password, Google
   service-account JSON, `SYNC_TOKEN`.
2. Migrations apply automatically on deploy (`preDeployCommand: npm run db:migrate`).
3. The **orwell-jobs** cron runs the full sync daily at 06:00 UTC; use its "Trigger Run"
   button for an on-demand populate, or `POST /api/sync` with `Authorization: Bearer
   $SYNC_TOKEN`.
4. Health probes: `GET /api/health/dataforseo`, `GET /api/health/google`; spend:
   `GET /api/usage`.

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
