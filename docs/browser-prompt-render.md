# Browser prompt — configure & deploy on Render

Give the text in the **PROMPT** block below to a browser-automation agent (or follow it
yourself). It drives the Render dashboard to deploy the Orwell SEO Command Centre from the
`render.yaml` Blueprint already committed to this repository.

Before starting, have these ready (the agent must NOT invent them — pause and ask the
operator for any that are blank):

- Render account login (the operator signs in; never store credentials in the prompt).
- GitHub repo access for `ngindubai/seocommand`, branch `claude/seo-dashboard-dataforseo-112fbm`.
- Optional now / required for live data later: DataForSEO API **login** + **password**;
  Google service-account JSON, `GA4_PROPERTY_ID`, `GSC_SITE_URL`.
- The public URL you intend to use (e.g. the Render-provided `*.onrender.com` URL) for
  `NEXT_PUBLIC_APP_URL`.

---

## PROMPT

```
You are setting up a production deployment on Render for the "Orwell SEO Command Centre".
The repository already contains a render.yaml Blueprint that defines everything. Do NOT
create services manually if the Blueprint flow works. Never fabricate secret values —
if a required secret is not supplied to you, stop and ask the operator for it.

STEP 1 — Sign in
- Go to https://dashboard.render.com and ensure the operator is signed in.
- If Render is not yet connected to GitHub, connect it and grant access to the
  repository "ngindubai/seocommand".

STEP 2 — Create the Blueprint
- Click "New +" → "Blueprint".
- Select the repository "ngindubai/seocommand".
- Set the branch to "claude/seo-dashboard-dataforseo-112fbm".
- Render will detect render.yaml and show three resources to create:
    1. orwell-db    (PostgreSQL 16)
    2. orwell-web   (Node web service)
    3. orwell-jobs  (Cron worker)
- Give the Blueprint group a name like "orwell-seo" and click "Apply".

STEP 3 — Fill environment variables on orwell-web
Open the orwell-web service → "Environment". Confirm/enter these keys. Keys marked
[from blueprint] are already set; keys marked [ASK OPERATOR] must be supplied — if blank,
pause and request them. Keys marked [secret] must be entered in the dashboard, never
committed.
  - NODE_VERSION            = 22.22.2            [from blueprint]
  - PORT                    = 10000              [from blueprint]
  - SEO_PROVIDER            = demo               [from blueprint]  (keep "demo" until the
                                                 DataForSEO adapter is implemented & tested)
  - MONTHLY_BUDGET_USD      = 200                [from blueprint]
  - DATABASE_URL            = (auto from orwell-db) [from blueprint — do not edit]
  - AUTH_SECRET             = (auto-generated)   [from blueprint — leave as generated]
  - NEXT_PUBLIC_APP_URL     = [ASK OPERATOR]     the service's public URL once known
  - DATAFORSEO_BASE_URL     = https://api.dataforseo.com  [from blueprint]
  - DATAFORSEO_LOGIN        = [secret][ASK OPERATOR when going live; may leave blank in demo]
  - DATAFORSEO_PASSWORD     = [secret][ASK OPERATOR when going live; may leave blank in demo]
  - GOOGLE_CLIENT_ID        = [secret][optional until GSC/GA4 live]
  - GOOGLE_CLIENT_SECRET    = [secret][optional until GSC/GA4 live]
  - GOOGLE_OAUTH_REDIRECT_URI = [ASK OPERATOR][optional until live]
  - GOOGLE_SERVICE_ACCOUNT_JSON = [secret][optional until live]
  - GA4_PROPERTY_ID         = [ASK OPERATOR][optional until live]
  - GSC_SITE_URL            = [ASK OPERATOR][optional until live]
Save changes.

STEP 4 — Confirm orwell-jobs (cron worker)
Open orwell-jobs → "Environment". Ensure it has the same DATABASE_URL (auto), SEO_PROVIDER=demo,
CRON_ENABLED=true, MONTHLY_BUDGET_USD=200, and the same DataForSEO/Google secrets (leave
blank while in demo). Confirm the schedule is "0 6 * * *" (06:00 UTC daily).

STEP 5 — Deploy & verify
- Trigger a deploy of orwell-web if one is not already running.
- Wait for the build ("npm ci && npm run build") and start ("npm run start") to succeed.
- Confirm the health check at path "/portfolio" passes and the service is "Live".
- Open the public URL. Verify the app loads at /portfolio and shows the amber
  "Demo data" banner (this is expected — it means no live provider is connected yet).
- Confirm orwell-db is "Available" and orwell-jobs shows a scheduled next run.

STEP 6 — Report back
Report: the public URL, the status of all three resources, which environment variables are
still blank (i.e. required before going live), and confirm the app is running in demo mode.
Do NOT switch SEO_PROVIDER to "dataforseo" — that happens only after the adapter is
implemented and credentials are verified.
```

---

## After this prompt

The app is live on Render in **demo mode**. To go live with data, complete
`browser-prompt-dataforseo.md`, implement the DataForSEO adapter, add the secrets above,
run the database migrations, then set `SEO_PROVIDER=dataforseo`.
