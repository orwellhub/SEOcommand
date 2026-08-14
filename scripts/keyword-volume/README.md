# Keyword volume pull

Standalone Google Ads search volume pull for the Orwell product catalogue seed
terms. Written so it runs on a bare GitHub Actions runner with no local
checkout and no application install.

## What it does

Posts the seed keywords to `keywords_data/google_ads/search_volume/live` for a
single market, writes `data/keyword-volume/results-<location_code>.json` and a
matching CSV, then commits both back to the branch.

Output keeps the `product` and `tier` columns from the seed file, so results map
straight back onto the catalogue without a join.

| Tier | Meaning |
| --- | --- |
| `V` | Vendor seeking. Wants somebody to build it. The buyer worth having. |
| `S` | Software seeking. Wants a licence. High volume, wrong intent. |
| `P` | Problem aware. Describing the pain. Content rather than paid search. |

`seeds-uk.json` holds 89 terms across the eight products. AE-only terms are
excluded; run location code 2784 with a separate seed file for that market.

## Credentials

Two repository secrets are required, under
**Settings > Secrets and variables > Actions**:

| Secret | Value |
| --- | --- |
| `DATAFORSEO_LOGIN` | The email address on the DataForSEO account |
| `DATAFORSEO_PASSWORD` | The generated API password, not the dashboard sign-in password |

Do **not** add `DATAFORSEO_BASE_URL`. It is the API host, not a credential, and
the workflow sets it directly. The runner rejects a login that looks like a URL
for exactly this reason.

Auth matches `src/providers/dataforseo/config.ts`:
`Authorization: Basic base64(login + ":" + password)`.

Without both secrets the job fails at the first step with instructions and
spends nothing.

## How to trigger a run

**The "Run workflow" button will not appear.** GitHub only surfaces
`workflow_dispatch` in the Actions tab when the workflow file exists on the
repository's *default* branch. This workflow lives only on
`keyword-volume-uk`, and the default branch is
`claude/seo-dashboard-dataforseo-112fbm`, so the manual trigger is not offered.

Use the `push` trigger instead, which works on any branch. Any commit touching
`scripts/keyword-volume/**` starts a run, including an edit to this file made
through the GitHub web editor.

To get the manual button as well, merge this workflow into the default branch.
The `workflow_dispatch` block is already in place and will start working once
the file lands there.

## Cost accounting

This script bypasses `src/providers/dataforseo`, so spend is **not** written to
the `api_cost` table and does **not** count against `MONTHLY_BUDGET_USD`. The
cost of each run is printed to the job log instead. One task of roughly ninety
keywords is a few cents.

If this becomes a recurring job rather than a one-off, move it behind the
provider so the ledger stays complete.

## Unrelated finding

`.github/workflows/ci.yml` triggers on `push` to `main`, but this repository has
no `main` branch. CI therefore only ever runs on pull requests, never on push.
