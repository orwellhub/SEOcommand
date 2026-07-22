# Provider contracts

The provider layer is the seam between the product and its data sources. Every source —
the demo provider today, DataForSEO / GSC / GA4 tomorrow — implements the **same typed
contract** and returns **canonical internal models**, never a raw vendor shape.

## Interfaces (`src/providers/contracts/index.ts`)

```ts
Envelope<T> = { data: T; provenance: Provenance }

KeywordResearchProvider     keywords(), keywordLists()
RankTrackingProvider        rankSnapshots(), positionBuckets(), visibility()
CompetitorIntelligence      competitors()
TechnicalCrawlProvider      issues(), health(), crawlRuns()
BacklinkIntelligence        backlinks(), referringDomains()
AiVisibilityProvider        prompts()
ContentIntelligence         content()
SearchPerformanceProvider   (GSC-backed; reserved)
AnalyticsProvider           (GA4-backed; reserved)

SeoProvider = all of the above + { name, live }
```

Each method returns `Promise<Envelope<T>>`, so provenance (source, collected timestamp,
range, location, device, freshness, mode) always travels with the data.

## Providers

| Provider | File | State |
| --- | --- | --- |
| Demo | `providers/demo/index.ts` | Active. Serves the `SEED` dataset through the contract with `mode: "demo"`. |
| DataForSEO | `providers/dataforseo/index.ts` | Scaffold. Endpoint mapping documented; methods throw until implemented. |
| Google (GSC/GA4) | `providers/google-*` | Reserved interfaces for first-party data. |

## Factory & the "never fake live" rule

`getSeoProvider()` (`providers/index.ts`) selects the provider from `SEO_PROVIDER`.
It returns the DataForSEO adapter **only** when `SEO_PROVIDER=dataforseo` *and* both
`DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` are present. Otherwise it returns the demo
provider. A provider is treated as "live" only once a real request succeeds — until then
the UI stays in demo mode and badges data as demo. The product never fabricates a live
API response.

## DataForSEO endpoint mapping

| Contract method | DataForSEO API |
| --- | --- |
| `keywords`, `keywordLists` | Labs: `ranked_keywords`, `keyword_ideas`, `keyword_suggestions` |
| `rankSnapshots`, `positionBuckets` | SERP API: `live/advanced`; Labs historical SERPs |
| `visibility` | Labs: `domain_rank_overview` (visibility index) |
| `competitors` | Labs: `competitors_domain`, `domain_intersection` |
| `issues`, `health`, `crawlRuns` | OnPage API: `task_post` → `summary` → `pages` |
| `backlinks`, `referringDomains` | Backlinks API: `backlinks`, `referring_domains` |
| `prompts` (AI visibility) | LLM Responses / Mentions API |
| `content` | Labs `relevant_pages` + OnPage content parsing |

First-party owned-site performance (clicks, impressions, CTR, position, conversions)
comes from **Google Search Console** and **GA4** and takes precedence for owned domains;
DataForSEO supplies external keyword/SERP/competitor/backlink/crawl/AI data.

## Adding a live adapter

1. Implement each method to call the vendor endpoint(s) above.
2. Validate the vendor response with Zod, then normalise into the canonical model.
3. Set `provenance.mode = "live"` (or `"cached"`) and the real `collectedAt`.
4. Keep all fetches server-side; read credentials from `process.env`.
5. Add a normalisation unit test (see the provider-adapter test in `src/`).
