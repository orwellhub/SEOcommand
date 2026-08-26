# Scalable platform upgrade

This release changes SEOcommand from a source-defined portfolio dashboard into a
database-managed operating platform for 300+ websites.

## Onboarding state machine

1. Operator enters the host, market, devices and tracking limits.
2. SEOcommand lists accessible Search Console and GA4 properties and marks host matches.
3. Operator adds a GitHub, Hostinger Git or signed webhook connection. Connection rows
   contain metadata and secret references only; publish mode is always review-only.
4. The forecast prices daily ranks, the full crawl, three competitor gaps, the backlink
   ledger/history and selected AI models.
5. Creating the site writes a `forecast_pending` profile. No paid call is allowed.
6. Explicit approval records the monthly ceiling and queues `initial_site_scan`.
7. The worker processes a bounded onboarding batch, marks the site active on success and
   retries failures without duplicating same-day snapshots.

## Cost gates

Paid requests pass two independent checks:

- site approval and the site's approved monthly ceiling;
- the portfolio-wide monthly DataForSEO guardrail.

Actual response cost is written to `provider_spend` with the site slug. Forecasts are
planning estimates and never replace that ledger.

## Data retained

- one immutable daily rank per keyword, device and date;
- detailed crawl runs and URL-level page records (status, metadata, canonicals, depth,
  timing, checks and link counts);
- competitor keyword-gap history;
- a deduplicated backlink ledger plus historical new/lost totals;
- prompt/model AI checks for ChatGPT, Claude, Gemini and Perplexity;
- alert rules, in-app notifications and queued delivery attempts.

## Alert delivery

In-app alerts are always stored. Email and WhatsApp use operator-owned HTTPS webhooks
configured with `ALERT_EMAIL_WEBHOOK_URL` and `ALERT_WHATSAPP_WEBHOOK_URL`. When
`ALERT_WEBHOOK_SECRET` is set, each JSON payload includes an `x-orwell-signature` HMAC.

## Capacity controls

`SYNC_CONCURRENCY` bounds portfolio fan-out and `ONBOARDING_JOBS_PER_RUN` bounds first
scans. The worker resumes queued work on later runs. Large page/link collections are
written in batches and read with pagination rather than loaded into the portfolio shell.
