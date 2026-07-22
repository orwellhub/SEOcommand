/**
 * Provider layer entry points.
 *
 * The platform runs exclusively on live data:
 *  - DataForSEO  → external SEO intelligence (src/providers/dataforseo)
 *  - Google      → first-party GSC + GA4     (src/providers/google)
 *
 * The sync engine (src/sync/engine.ts) pulls from both and persists canonical
 * snapshots; the UI reads snapshots via /api/live. There is no demo provider —
 * unsynced surfaces render explicit "awaiting first sync" states, never
 * fabricated data.
 */
export { dataForSeoConfigured, probeDataForSeo } from "./dataforseo";
export { googleAvailable, probeGoogle, createGoogleProvider } from "./google";
export type { GoogleProvider, SeoProvider, Envelope } from "./contracts";
