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
excluded; run location code 2784 with a separate seed file when that market is
wanted.

## Two setup steps

Both are browser-only. Neither needs a local checkout.

### 1. Add the workflow file

The Claude GitHub connector has `contents` write but not `workflows` write, so
this file could not be committed automatically. Create it by hand at
`.github/workflows/keyword-volume.yml` using **Add file > Create new file** in
the GitHub web UI, and paste the following:

```yaml
name: Keyword volume

on:
  push:
    branches:
      - keyword-volume-uk
    paths:
      - "scripts/keyword-volume/**"
      - ".github/workflows/keyword-volume.yml"
  workflow_dispatch:
    inputs:
      location_code:
        description: "DataForSEO location code (2826 = United Kingdom, 2784 = UAE)"
        required: false
        default: "2826"
      seeds_file:
        description: "Path to the seed file"
        required: false
        default: "scripts/keyword-volume/seeds-uk.json"

permissions:
  contents: write

concurrency:
  group: keyword-volume-${{ github.ref }}
  cancel-in-progress: false

jobs:
  pull:
    runs-on: ubuntu-latest
    steps:
      - name: Check out branch
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Pull search volume
        env:
          DATAFORSEO_LOGIN: ${{ secrets.DATAFORSEO_LOGIN }}
          DATAFORSEO_PASSWORD: ${{ secrets.DATAFORSEO_PASSWORD }}
          DATAFORSEO_BASE_URL: https://api.dataforseo.com
          LOCATION_CODE: ${{ github.event.inputs.location_code || '2826' }}
          SEEDS_FILE: ${{ github.event.inputs.seeds_file || 'scripts/keyword-volume/seeds-uk.json' }}
        run: node scripts/keyword-volume/run.mjs

      - name: Commit results
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/keyword-volume/
          if git diff --staged --quiet; then
            echo "No changes to commit."
          else
            git commit -m "chore(seo): keyword volume results"
            git push
          fi
```

Commit it to the `keyword-volume-uk` branch, not the default branch.

### 2. Add the credentials as repository secrets

`DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` currently exist only in Render, on
`orwell-web` and `orwell-jobs`. Copy the same two values into
**Settings > Secrets and variables > Actions > New repository secret**.

Until they exist here the job fails fast with instructions and spends nothing.

## Running it

Once both steps are done, use **Run workflow** on the Actions tab, or push any
change under `scripts/keyword-volume/`. The manual trigger accepts a
`location_code` so the same runner serves other markets later.

## Cost accounting

This script bypasses `src/providers/dataforseo`, so spend is **not** written to
the `api_cost` table and does **not** count against `MONTHLY_BUDGET_USD`. The
cost of each run is printed to the job log instead. One task of roughly ninety
keywords is a few cents.

If this becomes a recurring job rather than a one-off, move it behind the
provider so the ledger stays complete.

## Unrelated finding

`.github/workflows/ci.yml` triggers on `push` to `main`, but this repository has
no `main` branch. The default is `claude/seo-dashboard-dataforseo-112fbm`. CI
therefore only ever runs on pull requests, never on push.
