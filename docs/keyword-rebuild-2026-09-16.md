# Keyword research rebuild — 16 September 2026

The earlier keyword report collected a small, volume-sorted semantic sample and then filtered that sample locally. Questions could show zero despite matches elsewhere in the database, exact seed metrics were inserted as an extra result, and overview cards all opened the same unfiltered report.

## Implemented

- Keyword Overview follows the inspected Semrush structure: four metric columns, country distribution, monthly volume chart, variations and questions, strategy handoff, related keywords and saved/live SERP analysis. Existing SEO Command branding remains.
- Seed discovery uses DataForSEO Keyword Suggestions. Semantic related keywords use their separate related-keyword endpoint. General difficulty stays explicitly DataForSEO KD.
- Matching, question queries, include/exclude terms, intent, volume, difficulty, CPC, competitive density, word count, SERP features, groups and column sorting run before the provider's result limit. Draft fields do not trigger paid requests while typing.
- Provider counts are separate from collected counts. Volume and difficulty aggregates explicitly cover collected evidence, rather than claiming complete database totals.
- Continuation preserves filters, market, order and the provider cursor. Old saved scans remain accessible and are not combined with a different search algorithm.
- Exact seed metrics are report metadata, not an extra row in a filtered page. Overview Questions and Related links open their corresponding reports.
- Bulk Analysis collects up to 700 exact keywords per request. Individual and selected metric refresh, saved lists, groups, presets, country links, strategy/content links and tracking remain connected.
- Global demand is collected explicitly with DataForSEO's global clickstream endpoint and saved with country distribution. The card labels the different methodology from Google Ads based country volume.
- CSV and Excel include country, language, provider update date, collection date, SERP features and monthly history. Grouped Excel adds group summaries and memberships. Overview provides a print/PDF layout.
- Saved query/report metadata uses the existing JSON settings column. No database migration, reset or overwrite of historical collections is required. Merged lists drop stale discovery metadata and distinguish collection date from provider update date.
- Fixed a client race that could reopen an older scan after saving a new one. Export menus now close after choosing a format.

## Reference and limits

The live authenticated Semrush Keyword Magic screen was inspected on 16 September. It showed All/Questions, All/Broad/Phrase/Exact/Related, advanced filters, topics/groups, export/update controls and the keyword table. The previously captured live Keyword Overview was used for its four-column arrangement. A subsequent Semrush tab interaction timed out; no claim is made that every interactive Semrush state was reverified today.

DataForSEO and Semrush have different keyword databases and scoring. This release does not claim identical keyword counts, intent, volume, KD, relevance ranking or proprietary topic clusters. All/Broad discovery uses seed-word suggestions and provider variants; Related uses a separate graph. Group suggestions/counts and table aggregates describe collected rows. Selecting a group queries the full matching provider dataset. Semrush PKD, traffic-potential models, PLA and ad-history metrics are explicitly unavailable rather than fabricated. DataForSEO allows eight filter conditions per search; excess conditions are rejected before charging. Question patterns currently support English, Arabic, French, Spanish and German; other languages receive a clear message and can use Include keywords. Saved collections support up to 20,000 rows, with at most 1,000 returned per provider request.

## Validation

- Full unit/integration suite: 502 passing tests across 104 files.
- Focused cases cover provider filtering before pagination, exact seed separation, null/zero preservation, malformed versus genuinely empty responses, partial overview failures, permission and batch limits, cursor/query continuation, saved URLs and multi-sheet Excel structure.
- Browser checks use an isolated synthetic Global Bus Rental fixture: questions drilldown, match settings, draft filters without requests, collection continuation, saved reopening without paid calls, database sorting, lists, bulk analysis and 390/768/1280px overflow checks.
- Additional browser checks cover metric refresh, grouped workbook download, tracking country/language, group searches, SERP filters and saved presets.
- Live verification and existing-record checksums are recorded separately after deployment. Synthetic browser data is never presented as live provider evidence.

## Provider references

- https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live/
- https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live/
- https://docs.dataforseo.com/v3/dataforseo_labs/filters/
- https://docs.dataforseo.com/v3/keywords_data/clickstream_data/global_search_volume/live/
- https://dataforseo.com/pricing/keywords-data/clickstream-api-pricing
