# Google Search Console + GA4 integration

Supplies the owned-site metrics DataForSEO cannot: organic **clicks, impressions,
CTR, average position** (Search Console) and **sessions, engaged sessions,
conversions, landing pages** (GA4).

## Why not deploy the local MCP as-is

The `mc-mcp` bundle is a **local, read-only stdio MCP** that authenticates with an
interactive `gcloud` **Application Default Credentials** login (a desktop OAuth
client + browser sign-in). That model does not fit a headless web service:

- MCP-over-stdio is designed to be driven by a local *agent*, not called by a
  Next.js server over HTTP.
- `gcloud auth application-default login` needs an interactive browser — impossible
  on Render.

So instead of deploying the MCP, its **exact query logic was ported into native
server-side adapters** in the app, authenticated **headlessly**. The MCP's
`gsc_mcp.py` and `pull_ga4.py` are the reference spec; behaviour matches (including
the 2-day Search Console finalisation lag and the `share_of_market` benchmark).

## What was built

```
src/providers/google/
  config.ts   scopes, 2-day lag, GSC site map + GA4 property map, auth-config reader
  auth.ts     headless token minting (service account JWT OR OAuth refresh token), cached
  gsc.ts      Search Console REST: totals, breakdown, striking-distance, movers, share-of-market
  ga4.ts      GA4 Data API runReport: organic overview, landing pages, channels
  index.ts    composed GoogleProvider (contract) + probeGoogle() health check
src/data/benchmarks.json   the AE keyword universe (261 kw / 33,090 vol) for share-of-market
```

Route: `GET /api/health/google` — verifies credentials by listing GSC properties
(read-only) and returns the configured site/property maps. `configured:false` until
credentials are set.

## Auth — pick one (headless, server-side only)

**(A) Service account (recommended).** Create a service account, download its JSON
key, paste it as `GOOGLE_SERVICE_ACCOUNT_JSON` (one line). Then grant that
service-account email:
- **Search Console** → each domain property → Settings → Users and permissions →
  add the SA email as a **Full/Restricted** user.
- **GA4** → each property → Admin → Property Access Management → add the SA email as
  **Viewer**.

**(B) OAuth refresh token.** Reuse the existing OAuth client (the `oauth_client.json`
from the MCP) and your own Google login: set `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. The token must carry the
`webmasters.readonly` and `analytics.readonly` scopes. This is often quicker because
your account already owns the properties (no per-property grant needed).

Scopes used: `webmasters.readonly` (GSC), `analytics.readonly` (GA4).

## Property mappings (from the domain registry; override per-env)

All mappings live in `src/data/domains.ts` (one row per domain) and can be overridden
with `GSC_SITE_<ID>` / `GA4_PROPERTY_<ID>` env vars. The service account
`orwell-seo-reader` has GSC access to all 12 properties.

| Domain | GSC property | GA4 property |
| --- | --- | --- |
| MortgageCompare | `sc-domain:mortgagecompare.ae` | `529950642` |
| BusRentalGlobal | `sc-domain:busrentalglobal.com` | *(unmapped — `GA4_PROPERTY_BUSRENTALGLOBAL`)* |
| PetTransportGlobal | `sc-domain:pettransportglobal.com` | `536371348` |
| MoneyCompare | `sc-domain:moneycompare.ae` | `541738826` |
| InsureCompare | `sc-domain:insurecompare.ae` | `541656359` |
| PestRemovalUSA | `sc-domain:pestremovalusa.com` | `542325553` |
| CloseProtectionHire | `sc-domain:closeprotectionhire.com` | `536427457` |
| CheckMyEnergyClaim | `sc-domain:checkmyenergyclaim.co.uk` | *(unmapped)* |
| EnergyClaimHelpline UK | `sc-domain:energyclaimhelpline.co.uk` | *(unmapped)* |
| EnergyClaimHelpline | `sc-domain:energyclaimhelpline.com` | *(unmapped)* |
| MyEnergyClaim | `sc-domain:myenergyclaim.com` | *(unmapped)* |
| WarmHomeSchemeLoan | `sc-domain:warmhomeschemeloan.co.uk` | *(unmapped)* |

GSC works for all 12 immediately. GA4 ids marked *unmapped* weren't in the source account
dump — set each via `GA4_PROPERTY_<ID>` (e.g. `GA4_PROPERTY_WARMHOMESCHEMELOAN`) once known.
GA4 calls for an unmapped domain return a clear "not configured" error while GSC still works.

## Going live — checklist

1. In Render, on **orwell-web** (and **orwell-jobs** for scheduled sync), set the
   chosen auth vars (A or B) plus `GA4_PROPERTY_BUSRENTALGLOBAL` if available.
2. Grant the service account access to each GSC + GA4 property (method A only).
3. Deploy, then open `GET /api/health/google` — expect `configured:true`,
   `gscReachable:true`, and a `propertiesVisible` count. Fix access if it errors.
4. The GSC/GA4-sourced KPIs (clicks, impressions, conversions, traffic, share of
   market) can then be wired into the dashboard alongside the DataForSEO data.

## share_of_market

`benchmarks.json` holds the researched AE keyword universe (261 keywords, 33,090
searches/month, 45% click-availability → 14,890 available clicks/month). The
`shareOfMarket` method divides measured GSC clicks by that pro-rated pool — a
measured headline number, not an estimate. Add entries keyed by a property's
`site` value to benchmark other domains.
