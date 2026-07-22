# Cost controls

DataForSEO is the paid provider; GSC and GA4 API pulls are free. Every DataForSEO call goes
through `SpendGuard`, which checks the configured monthly ceiling before the request and
records the provider's returned cost afterwards in `provider_spend`.

The default cadence is:

| Tier | Data | Cadence |
| --- | --- | --- |
| `google` | GSC and GA4 | Daily |
| `dfsLight` | Keywords, rankings, competitors, backlinks | Mondays |
| `dfsHeavy` | OnPage crawl initiation and AI prompt checks | First of month |

Pending crawls are polled on daily runs without initiating another paid crawl. Manual
`POST /api/sync` calls require `SYNC_TOKEN`; use `tier=google` or `tier=light` and a domain
when a full pull is unnecessary.

`GET /api/usage` returns the guard status. `GET /api/usage/breakdown` groups actual spend
by domain and endpoint. Both endpoints require an authenticated session.

The application guard is a primary control, not a billing guarantee. Keep a provider-side
spend alert as a second backstop and avoid overlapping manual full pulls with the cron.
