import type { DomainId } from "@/lib/types";
import { DOMAINS } from "@/data/domains";

/**
 * Google (Search Console + GA4) configuration, server-side only.
 *
 * Auth is headless — a service account JSON or a stored OAuth refresh token —
 * NOT the interactive `gcloud` login the local MCP used (which cannot run on a
 * server). Property mappings are derived from the domain registry, with an
 * optional per-domain env override (GSC_SITE_<ID> / GA4_PROPERTY_<ID>).
 */

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Search Console finalises data on a ~2 day lag (mirrors the reference MCP). */
export const GSC_DATA_LAG_DAYS = 2;

function envKey(prefix: string, id: DomainId): string | undefined {
  return process.env[`${prefix}_${id.toUpperCase()}`];
}

/** GSC domain property per domain (registry value, env-overridable). */
export const GSC_SITE_MAP: Record<DomainId, string> = Object.fromEntries(
  DOMAINS.map((d) => [d.id, envKey("GSC_SITE", d.id) ?? d.gscSite]),
) as Record<DomainId, string>;

/** GA4 numeric property id per domain (registry value, env-overridable; null if unmapped). */
export const GA4_PROPERTY_MAP: Record<DomainId, string | null> = Object.fromEntries(
  DOMAINS.map((d) => [d.id, envKey("GA4_PROPERTY", d.id) ?? d.ga4PropertyId]),
) as Record<DomainId, string | null>;

export interface GoogleAuthConfig {
  mode: "service_account" | "refresh_token";
  serviceAccountJson?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  quotaProject?: string;
}

/** Resolve which headless auth method is configured, if any. */
export function readGoogleAuthConfig(): GoogleAuthConfig | null {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (sa) {
    return { mode: "service_account", serviceAccountJson: sa, quotaProject: process.env.GOOGLE_CLOUD_PROJECT };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (clientId && clientSecret && refreshToken) {
    return { mode: "refresh_token", clientId, clientSecret, refreshToken, quotaProject: process.env.GOOGLE_CLOUD_PROJECT };
  }
  return null;
}

export const GSC_API = "https://searchconsole.googleapis.com/webmasters/v3";
export const GA4_API = "https://analyticsdata.googleapis.com/v1beta";
