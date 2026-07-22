# Architecture

## Overview

Orwell SEO Command Centre is a single Next.js (App Router) application that presents a
portfolio-first SEO operations platform running **exclusively on live provider data**.

```
cron (daily 06:00 UTC) ──► sync engine ──► DataForSEO + GSC + GA4 APIs
                               │
                               ▼
                    canonical snapshots (Postgres
                    dataset_snapshots, per domain/dataset/day)
                               │
                               ▼
                   /api/live/[domain] · /api/live/portfolio
                               │
                               ▼
                    client pages (useLiveDomain hook)
```

Un-synced surfaces render explicit "awaiting first sync" states — the product never
fabricates a number. The former demo-seed layer has been removed.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  UI (App Router route modules)                              │
│  app/(app)/{portfolio,domain,research,rankings,site-audit,  │
│  backlinks,ai-visibility,content,recommendations,reports,   │
│  settings}/page.tsx                                         │
├─────────────────────────────────────────────────────────────┤
│  Component layer                                            │
│  shell/ (rail, top nav, context bar, domain context)       │
│  ui/ (KPI card, DataTable, Drawer, badges, usage meter)    │
│  charts/ (Recharts wrappers, SVG sparkline)                │
├─────────────────────────────────────────────────────────────┤
│  Data access                                               │
│  data/metrics.ts (derived KPIs)  ← reconciled aggregates   │
│  providers/ (contracts → demo | dataforseo | google)       │
├─────────────────────────────────────────────────────────────┤
│  Canonical models (lib/types.ts)                           │
├─────────────────────────────────────────────────────────────┤
│  Persistence (db/schema.ts — Drizzle/Postgres)             │
│  used by live sync jobs; demo build does not require it    │
└─────────────────────────────────────────────────────────────┘
```

### The sync → snapshot → read-model pattern

Provider data is NOT fetched on page view. The sync engine (`src/sync/engine.ts`)
collects each dataset (budget-guarded for DataForSEO; free for Google), normalises to
canonical models and upserts one snapshot per (domain, dataset, day). Pages read the
latest snapshot through `/api/live/*` via a small SWR-style client hook. This keeps page
loads instant, spend deliberate, history reconstructable and provenance attached to every
dataset. OnPage crawls are async and resume across sync runs via stored task ids.

## State & domain scope

- `components/shell/domain-context.tsx` holds the selected scope (`portfolio` or a
  `DomainId`), comparison chips and date range, persisted to `localStorage`.
- Selecting a domain sets a CSS variable `--accent` so the whole workspace themes to the
  brand colour (purple / orange / teal).
- Domain-specific modules use `useResolvedDomain()`, which falls back to the first pilot
  domain when the portfolio scope is active.

## Design system — "Portfolio Atlas"

Tokens live in `tailwind.config.ts` and `app/globals.css`:

- Surfaces: midnight rail `#071226`, dark nav `#0D1B34`, workspace `#F3F6FA`, cards white.
- Accents: purple `#7137F5` (primary), plus per-brand orange/teal.
- Semantic: success `#16A477`, warning `#E6A326`, critical `#EF4D56`.
- Inter with tabular numerals, 1px borders, 8–14px radii, restrained shadows, 8px spacing.
- Motion is 140–180ms ease-out and respects `prefers-reduced-motion`.

## Rendering & routing

- The `(app)` route group wraps every module in `DomainProvider` + `AppShell`
  (rail + top nav + context bar + demo banner + scrollable workspace).
- `/` redirects to `/portfolio`.
- Route modules are client components because they use context, charts and interactive
  tables. Provider calls (production) are async and would move data fetching to server
  components / route handlers when live.

## Background jobs

`scripts/jobs.ts` is the cron entrypoint (`npm run jobs`, wired to a Render cron service
in `render.yaml`). Jobs are idempotent and observable; in demo mode they are safe no-ops
that log why they skipped. Each live job checks the budget guardrail, batches and
deduplicates, retries with exponential backoff, writes immutable snapshots and appends to
the usage ledger.

## Security posture

- Provider secrets are server-side only (`.env` / Render secret env vars), never imported
  into client components, never in the browser bundle.
- All provider responses and API inputs are validated with Zod at the adapter boundary.
- Role permissions are enforced server-side (production auth).
- Snapshots are immutable and per-domain scoped to prevent cross-domain leakage.
- Crawler targets must be validated against the domain allow-list before any request.

## Testing

Vitest covers provider normalisation, scoring, ranking-snapshot derivation, budget
enforcement, issue grouping and provenance labelling. See `src/**/*.test.ts` and section
17 of the product brief for the intended matrix.
