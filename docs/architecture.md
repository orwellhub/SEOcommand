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
│  sync/bundle.ts (protected read models)                    │
│  providers/ (DataForSEO + Google adapters)                 │
├─────────────────────────────────────────────────────────────┤
│  Canonical models (lib/types.ts)                           │
├─────────────────────────────────────────────────────────────┤
│  Persistence (db/schema.ts — Drizzle/Postgres)             │
│  snapshots, spend, workflow and report delivery schedules │
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

- Middleware verifies a signed HTTP-only session before any dashboard or read API is reached.
- The `(app)` route group wraps every module in `DomainProvider` + `AppShell`
  (rail + top nav + context bar + scrollable workspace).
- `/` redirects to `/portfolio`.
- Route modules are client components because they use context, charts and interactive
  tables. Provider calls run only in the scheduled server process; pages use protected
  route handlers to read stored snapshots.

## Background jobs

`scripts/jobs.ts` is the cron entrypoint (`npm run jobs`, wired to a Render cron service
in `render.yaml`). Google runs daily, DataForSEO light datasets weekly and heavy crawl/AI
datasets monthly. Jobs check the budget guardrail, retry with exponential backoff, upsert
daily snapshots and append to the spend ledger. After syncing, due report schedules are
sent to the configured signed delivery webhook.

## Security posture

- Provider secrets are server-side only (`.env` / Render secret env vars), never imported
  into client components, never in the browser bundle.
- API inputs are validated with Zod; provider normalisers defensively handle payload drift.
- Signed sessions protect dashboard/read APIs; mutation routes enforce write-capable roles.
- Same-day snapshots are idempotently upserted and scoped by stable domain slug.
- Crawler targets must be validated against the domain allow-list before any request.

## Testing

Vitest covers provider normalisation, scoring, ranking-snapshot derivation, budget
enforcement, issue grouping and provenance labelling. See `src/**/*.test.ts` and section
17 of the product brief for the intended matrix.
