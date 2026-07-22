# Orwell SEO Command Centre

A multi-brand, portfolio-first SEO intelligence platform — an original alternative to
the parts of Semrush that matter to a company operating several websites. Monitor and
operate SEO across many domains from one place: rankings, site audits, backlinks, AI
visibility, content, recommendations, tasks and reports.

> **This build runs on realistic seeded demo data.** Every screen is labelled **Demo
> data** until live providers (DataForSEO, Google Search Console, GA4) are connected.
> The provider-adapter layer is already in place, so switching to live data is a
> configuration change, not a rewrite. Live requests are never faked.

Pilot portfolio: **MortgageCompare.ae**, **BusRentalGlobal.com**, **PetTransportGlobal.com**
(architected for many more).

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript** (strict)
- **Tailwind CSS** with a deliberate design-token + component layer ("Portfolio Atlas")
- **Recharts** + dependency-free SVG sparklines
- **Drizzle ORM** + **PostgreSQL** (production data model; demo needs no DB)
- **Zod** for input / provider-response validation
- **Vitest** for unit tests
- Deployed on **Render** (web service + managed Postgres + cron worker) — see `render.yaml`

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000  → redirects to /portfolio
```

No database, no API keys, no external services are required to run the demo — it renders
from deterministic seed modules in `src/data`.

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # next lint
npm run test         # vitest
```

## What's in the box

| Module | Route | Highlights |
| --- | --- | --- |
| Portfolio | `/portfolio` | Cross-domain KPIs, visibility comparison, leaderboard, movers, priority actions, data-source health |
| Domain overview | `/domain` | Per-domain health, clicks/impressions, visibility, top pages, competitor & ranking movement |
| Research | `/research` | Keyword explorer with filters, organic competitors, keyword gap, saved lists |
| Rankings | `/rankings` | Position distribution, visibility trend, winners/losers, SERP-feature ownership, cannibalisation |
| Site Audit | `/site-audit` | Transparent health score, issues with evidence & fixes, crawl history, affected-page drawer |
| Backlinks | `/backlinks` | **Orwell Authority Score**, referring domains, new/lost, anchors, risk review |
| AI Visibility | `/ai-visibility` | Prompt tracking, mention/citation rate, competitor SoV, response inspection |
| Content | `/content` | Inventory, decay, cannibalisation, opportunities, brief generator |
| Recommendations | `/recommendations` | Priority queue, approval workflow, task board (human-approval gate) |
| Reports | `/reports` | Templates, scheduled reports, custom builder, PDF/CSV export interfaces |
| Settings | `/settings` | Domains, data connections, users & roles, **cost controls / $200 guardrail** |

## Architecture at a glance

```
src/
  app/(app)/…            Route modules (client pages) + app shell layout
  components/
    shell/               Portfolio rail, top nav, context bar, domain context, mobile nav
    ui/                  KPI card, DataTable, Drawer, badges, usage meter, primitives
    charts/              Recharts wrappers + SVG sparkline
  data/                  Deterministic seed engine + derived metrics (the demo data source)
  providers/
    contracts/           Typed provider interfaces (canonical models in/out)
    demo/                Demo provider (serves seed through the contract)
    dataforseo/          Live adapter scaffold with endpoint mapping
  db/                    Drizzle schema + lazy connection (production persistence)
  lib/                   Types, formatting, dates, PRNG, nav
scripts/                 jobs.ts (cron worker), seed.ts (DB bootstrap)
docs/                    Architecture, data model, contracts, scoring, cost, live-connection
```

Full detail in [`docs/architecture.md`](docs/architecture.md).

## Roles & auth

Prepared roles: `admin`, `manager`, `seo_analyst`, `viewer`. The demo ships with a
clearly-isolated demo boundary and a single demo admin — no hard-coded passwords or
secrets. Replace with a real auth provider before production (see `AUTH_SECRET` in
`.env.example`).

## Going live

1. Copy `.env.example` → `.env.local` and fill values (never commit secrets).
2. Provision Postgres, run `npm run db:generate && npm run db:migrate`, optionally `npm run db:seed`.
3. Add DataForSEO credentials (`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`). The **live
   adapter is implemented** (`src/providers/dataforseo`) with Basic auth, the app-owned
   $200/month spend guardrail, graceful `40203`/error handling and async OnPage polling.
4. Verify with `GET /api/health/dataforseo` (credentials + spend status) and watch spend at
   `GET /api/usage`.
5. Flip `SEO_PROVIDER=dataforseo` and `NEXT_PUBLIC_SEO_PROVIDER=dataforseo` — the app only
   treats a provider as live once a real request succeeds; otherwise it stays in demo mode.

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
