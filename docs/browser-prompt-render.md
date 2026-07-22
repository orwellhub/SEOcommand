# Render deployment checklist

1. Create the Blueprint from `render.yaml`. It provisions `orwell-web`, `orwell-jobs` and
   the Frankfurt Postgres database.
2. On `orwell-web`, set `AUTH_EMAIL` and `AUTH_PASSWORD` (or `AUTH_USERS_JSON`), plus the
   generated `AUTH_SECRET` and a long random `SYNC_TOKEN`.
3. On both services, set DataForSEO and Google credentials. Set explicit DataForSEO
   locations for multi-market domains and any GA4 property overrides.
4. Optionally set `REPORT_DELIVERY_WEBHOOK_URL` and `REPORT_WEBHOOK_SECRET` on
   `orwell-jobs` for scheduled delivery through Make, n8n, Zapier or another mail adapter.
5. Deploy. The pre-deploy command applies Drizzle migrations. Confirm `/api/healthz`
   returns HTTP 200, then sign in and check provider health from Settings.
6. Trigger a Google-only sync first, then one-domain DataForSEO light sync, then inspect
   spend before enabling the normal cron.

Do not expose `/portfolio` as a public health endpoint; it requires a signed session.
Provider health, usage and live snapshot APIs are also authenticated.
