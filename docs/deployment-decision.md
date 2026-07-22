# Deployment decision: Render, not Hostinger

## Decision

Deploy the Orwell SEO Command Centre on **Render** using the `render.yaml` Blueprint
(web service + managed PostgreSQL + cron worker). It is **not** suitable for a standard
Hostinger website plan.

## Why not standard Hostinger web hosting

Hostinger's mainstream shared/website plans are built for static sites, WordPress and
PHP. This product is fundamentally a **server application**, and it needs:

| Requirement | Why | Shared Hostinger |
| --- | --- | --- |
| Persistent Node.js server | Next.js App Router renders on a Node runtime (`next start`) | ✗ Not a long-running Node host |
| Managed PostgreSQL | Live snapshots, ledger, workflow tables | ✗ MySQL-centric, no managed PG |
| Server-side secrets | DataForSEO / Google credentials must never reach the browser | ✗ No first-class secret env store |
| Scheduled background jobs | Daily/weekly idempotent sync workers | ✗ Limited cron, no worker service |
| Zero-downtime deploys from git | CI/CD on push | ✗ Manual/FTP-oriented |

You *could* run this on a **Hostinger VPS** (self-managed Node + Postgres + a process
manager + your own cron). That is viable but shifts all provisioning, TLS, backups,
scaling and secret management onto you. Render provides those as managed primitives via a
single Blueprint, which is the right trade-off for an internal platform that must be
reliable and cheap to operate.

## What Render provisions (`render.yaml`)

1. **orwell-db** — managed PostgreSQL 16.
2. **orwell-web** — the Next.js web service (`npm ci && npm run build` → `npm run start`),
   health-checked at `/portfolio`, `DATABASE_URL` injected from the database, secrets as
   `sync: false` env vars entered in the dashboard, and a generated `AUTH_SECRET`.
3. **orwell-jobs** — a cron worker (`npm run jobs`) running the idempotent daily sync;
   a safe no-op in demo mode.

## Cost posture

Start on Render's low-cost Starter web plan + a small Postgres instance. The app itself
runs fine in demo mode with no provider spend; the $200/month DataForSEO guardrail governs
API cost once live (see `docs/cost-controls.md`).

## Operator setup

Follow [`browser-prompt-render.md`](browser-prompt-render.md) to complete the Render
Blueprint, fill environment variables and deploy.
