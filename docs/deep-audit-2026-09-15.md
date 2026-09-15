# SEO Command implementation and screen audit — 15 September 2026

Test website: **Global Bus Rental** (`globalbusrental.com`). Production data is retained. No new subscription, outgoing email, publication or external document creation was used for testing.

## Implemented and locally verified

- A shared report definition and document renderer for preview, PDF archive, CSV and scheduled delivery. Templates, section inclusion/order, reporting period, website/group/campaign scope and branding are carried through. Campaign tables are accompanied by explicitly website-level report sections.
- DataForSEO organic/paid search-traffic estimates, historical search trends and top pages. These remain separate from measured Google figures and unavailable all-channel competitor traffic.
- Browser crawl page inspection: details, incoming/outgoing links, resource timing, history, single-URL recrawl, site structure, depth/page/delay settings and exclusions. Checkpoints retain completed pages. Dead worker jobs recover without deleting history. Concurrent queue requests deduplicate.
- Ranking visibility, estimated traffic and selected-competitor share with explicit cohort/volume coverage. Missing observations stay unknown; duplicate devices do not multiply search demand.
- Background keyword/domain collection with page checkpoints, cost ceilings, cancellation and safe resumption. Uncertain paid requests are not automatically repeated. Older saved collections remain reachable.
- Outreach reply drafts/thread headers, opt-in inbox refresh and scheduled acquired-link checks. Sending still requires explicit approval and a connected mailbox.
- Inline content guidance and revision-safe WordPress draft/Google Docs export connections. Repeated clicks reuse the existing export; a partially created Google document retains its link.
- Local grid history, coordinate-based comparisons and geographic context.
- An explicit DataForSEO Lighthouse speed-test alternative when Google quota is unavailable. Provider, price and lab-only limitations are disclosed.
- Provisioning websites receive free scheduled Google refreshes. Draft, paused and archived sites remain excluded; paid setup is not activated by this recovery.

## Verification

- **442 automated tests in 89 files passed**. Includes database-backed queue deduplication, history retention, paid request checkpoints, cancellation/resume, content-export mocks, email headers, metrics and report section order.
- Type checking, strict lint and production webpack build passed.
- **75 navigation screens** loaded in a one-website preview with no detected console errors or page-wide overflow at 1280px. This is navigation coverage, not a claim that every possible state was tested.
- Five key screens additionally checked at 390px: Domain Overview, Position Tracking, Browser Crawl, Writing Assistant and Client Report; no page-wide overflow. Calendar checked separately at the same width.
- Interactive checks: crawl detail/incoming/resource/history tabs; report reordering and transfer to scheduling; PDF+CSV format selection; content brief creation, draft save, workflow advancement, readability and calendar continuity.

## Live data verification before release

The free Google-only scan completed on 15 September 2026 at 10:44 UTC. All requested Google datasets succeeded.

| Measure | Stored result | Scope |
| --- | ---: | --- |
| Search Console clicks | 223 | 17 August–13 September requested window; four returned daily observations |
| Search Console impressions | 8,094 | Same window |
| Search Console CTR | 2.8% | Rounded aggregate; daily totals reconcile |
| Search Console average position | 9.8 | Impression-weighted aggregate |
| GA4 organic sessions | 10 | 17 August–13 September |
| GA4 organic key events | 0 | Recorded result, not a connection error |

The Search Console daily observations sum to 223 clicks and 8,094 impressions. GA4 daily observations sum to 10 sessions and 12 views. Search and Analytics represent different measurements; they should not be expected to match each other.

The site was stuck in `provisioning`, which excluded it from the old daily scheduler. A manual Google refresh succeeded, confirming that the web service's Google credentials work. Worker credential availability still requires release verification.

## Remaining external and product boundaries

- DataForSEO does not supply competitor total visits/direct/social/referral audience estimates equivalent to Semrush Traffic Analytics. All-channel panels remain explicitly unavailable without a separate source.
- WordPress application credentials and Google Docs document-creation permission must be configured to activate external draft exports. Gmail sending/replies also require a dedicated connected mailbox. These were tested using mocks, without sending messages or creating documents.
- Global Bus Rental has no saved local business location. Local management/grid interactions were checked using the one-site fixture; no fabricated location was purchased.
- Large keyword and footprint collections now have background pagination; existing multi-domain comparison remains bounded by its current collection limit. Very large client-side report tables still need server-side paging for substantially greater scale.
- Semrush's proprietary authority/intent/AI datasets and formulas are not reproduced. Methods and unavailable inputs are labelled. This audit does not assert full Semrush or pixel-perfect parity.

## Release status

Local checks complete. Production deployment, paid DataForSEO checks, live screen audit and historical-data fingerprint verification are recorded in the final audit artifact after release.

## Evidence

Full navigation snapshots, responsive results and screenshots are in `outputs/deep-audit-2026-09-15/` in the task workspace. Preview screenshots contain synthetic data and are not production measurements.
