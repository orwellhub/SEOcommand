# DataForSEO operator checklist

Use this checklist in the Render dashboard. Never paste credentials into source files,
issues, chat transcripts or build logs.

1. Set `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` on both `orwell-web` and `orwell-jobs`.
2. Keep `DATAFORSEO_BASE_URL=https://api.dataforseo.com` and confirm
   `MONTHLY_BUDGET_USD=200` (or the approved ceiling).
3. Set an explicit priority market for every multi-market domain, especially
   `DATAFORSEO_LOCATION_BUSRENTALGLOBAL` and
   `DATAFORSEO_LOCATION_PETTRANSPORTGLOBAL`. There is intentionally no UK fallback.
4. Deploy, sign in, then open `/api/health/dataforseo`. Confirm `configured: true`, no
   provider error and the expected spend ceiling.
5. Trigger one domain with `POST /api/sync?domain=<id>&tier=light` using the `SYNC_TOKEN`
   bearer token. Check `/api/usage/breakdown` before running a full portfolio pull.
6. Confirm keyword location, language, backlink counts and rankings against a small sample
   in the DataForSEO console.

The scheduled policy is Google daily, DataForSEO light on Mondays and crawl/AI on the
first of each month. Manual `/api/sync` calls default to a full pull, so always choose a
domain and tier during verification.
