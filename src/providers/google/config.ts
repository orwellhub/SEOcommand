import type { DomainId } from "@/lib/types";

/**
 * Google (Search Console + GA4) configuration, server-side only.
 *
 * Auth is headless — a service account JSON or a stored OAuth refresh token —
 * NOT the interactive `gcloud` login the local MCP used (which cannot run on a
 * server). Property mappings default to the values discovered from the account
 * and can be overridden per-env.
 */

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Search Console finalises data on a ~2 day lag (mirrors the reference MCP). */
export const GSC_DATA_LAG_DAYS = 2;

/** GSC domain properties per pilot (verified as siteOwner on the account). */
export const GSC_SITE_MAP: Record<DomainId, string> = {
  mortgagecompare: process.env.GSC_SITE_MORTGAGECOMPARE ?? "sc-domain:mortgagecompare.ae",
  busrentalglobal: process.env.GSC_SITE_BUSRENTALGLOBAL ?? "sc-domain:busrentalglobal.com",
  pettransportglobal: process.env.GSC_SITE_PETTRANSPORTGLOBAL ?? "sc-domain:pettransportglobal.com",
};

/** GA4 property IDs per pilot (bare numeric id; `properties/` prefix added at call time). */
export const GA4_PROPERTY_MAP: Record<DomainId, string | null> = {
  mortgagecompare: process.env.GA4_PROPERTY_MORTGAGECOMPARE ?? "529950642",
  pettransportglobal: process.env.GA4_PROPERTY_PETTRANSPORTGLOBAL ?? "536371348",
  // BusRental GA4 property id was not present in the source account dump — set via env.
  busrentalglobal: process.env.GA4_PROPERTY_BUSRENTALGLOBAL ?? null,
};

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
