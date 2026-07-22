# Provider contracts

Provider adapters normalise external payloads into the canonical types in
`src/lib/types.ts`. The sync engine stores those values with provenance, and the UI reads
only the stored bundle contract in `src/lib/live.ts`.

## DataForSEO

`src/providers/dataforseo` owns Basic authentication, location configuration, guarded
requests, status classification, resumable OnPage tasks and defensive normalisation. All
paid calls must pass through `DataForSeoClient`; direct fetches are not allowed.

## Google

`src/providers/google` uses headless service-account or refresh-token authentication.
GSC and GA4 requests have server-side timeouts and return canonical totals, rows, movers,
timeseries and landing-page models.

## Provenance rules

Every stored dataset identifies its source, collection time, range, market, device,
freshness and live/cached mode. Derived scores and recommendations must say that they are
derived and keep the evidence used to produce them.

API inputs use Zod. External response normalisers must tolerate optional provider fields
but must not silently substitute a different market or fabricate a metric.
