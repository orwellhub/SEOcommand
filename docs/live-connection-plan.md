# Live-connection plan

What is required to switch each data source from demo to live. **No credentials are ever
committed to the repository** — values are entered in the Render dashboard (or `.env.local`
for local dev). `.env.example` lists variable names only.

## 0. Prerequisites

- Provision PostgreSQL (Render Blueprint does this as `orwell-db`).
- `npm run db:generate && npm run db:migrate` to create tables.
- Optionally `npm run db:seed` to bootstrap org/users/domains.

## 1. DataForSEO

**Needed:** an active DataForSEO account with API access; the API **login** and
**password** (Basic auth); confirmation of which APIs are enabled (Labs, SERP, OnPage,
Backlinks, Keywords Data, LLM/Mentions).

**Environment variables** (server-side only):
```
SEO_PROVIDER=dataforseo
DATAFORSEO_LOGIN=…
DATAFORSEO_PASSWORD=…
DATAFORSEO_BASE_URL=https://api.dataforseo.com
```

**Implementation steps:**
1. Fill in the adapter methods in `src/providers/dataforseo/index.ts` per the endpoint map
   in `docs/provider-contracts.md`.
2. Validate each response with Zod and normalise to the canonical models.
3. Wrap calls with caching, dedupe, batching, retry/backoff and ledger writes
   (`docs/cost-controls.md`).
4. Keep `SEO_PROVIDER=demo` until the adapter is verified, then flip to `dataforseo`.
   The factory only goes live when credentials are present and a real request succeeds.

A ready-to-use operator prompt for configuring the DataForSEO side is in
[`browser-prompt-dataforseo.md`](browser-prompt-dataforseo.md).

## 2. Google Search Console (first-party, owned sites)

**Needed:** a Google Cloud project with the **Search Console API** enabled; a **service
account** granted access to each verified GSC property (or an OAuth client for delegated
access); the verified **site URL(s)**.

**Environment variables:**
```
GOOGLE_SERVICE_ACCOUNT_JSON=…   # or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / redirect
GSC_SITE_URL=…
```

**Data:** clicks, impressions, CTR, average position by query/page/device/country, plus
indexing signals. GSC data takes precedence for owned-site performance.

## 3. Google Analytics 4

**Needed:** a Google Cloud project with the **GA4 Data API** enabled; a service account
added to the GA4 property with Viewer access; the **GA4 property ID**.

**Environment variables:**
```
GOOGLE_SERVICE_ACCOUNT_JSON=…
GA4_PROPERTY_ID=…
```

**Data:** organic sessions, engaged sessions, conversions/leads, revenue where available,
and landing-page performance.

## 4. Property mapping

After connecting, map each Orwell domain to its GSC property and GA4 property in
**Settings → Data connections** (persisted to `domain_properties`).

## 5. Verification & cutover

1. Connect one provider for one domain.
2. Run a manual sync; confirm a `provider_sync_run` row and ledger entries appear.
3. Confirm the UI provenance badge flips from **Demo data** to the live source.
4. Roll out to remaining domains/providers.
5. Enable the Render cron worker (`CRON_ENABLED=true`) for scheduled syncs.

Until every step above succeeds for a given dataset, that dataset stays labelled demo.
