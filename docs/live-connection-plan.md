# Live connection plan

## Required platform configuration

- `DATABASE_URL`
- `AUTH_SECRET` plus `AUTH_EMAIL`/`AUTH_PASSWORD` or `AUTH_USERS_JSON`
- `SYNC_TOKEN`
- DataForSEO credentials and explicit locations for multi-market domains
- Google service-account JSON or OAuth refresh-token credentials
- GA4 property overrides for domains without a registry mapping

## Go-live order

1. Deploy and verify public `/api/healthz`.
2. Sign in and verify `/api/health/google` and `/api/health/dataforseo`.
3. Run `tier=google` for one domain and reconcile totals with GSC/GA4.
4. Run `tier=light` for one domain and reconcile ranking location, keywords and spend.
5. Start one OnPage crawl, confirm its task id persists, and let the next cron poll it.
6. Enable the normal cron and inspect `/api/usage/breakdown` after the first paid cycle.
7. Configure the report webhook only after a test endpoint verifies the signed payload.

Missing credentials or snapshots never trigger fabricated fallback data. The affected UI
surface stays in an explicit awaiting-first-sync or configuration-error state.
