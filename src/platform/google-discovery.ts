import { getGoogleAccessToken } from "@/providers/google/auth";
import { GA4_SCOPE, GSC_API, GSC_SCOPE } from "@/providers/google/config";
import type { GooglePropertyCandidate, GooglePropertyDiscovery } from "./types";

function cleanHost(host: string): string {
  return host.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function matchesHost(value: string | null | undefined, host: string): boolean {
  return cleanHost(value ?? "").includes(cleanHost(host));
}

/** List accessible GSC and GA4 Admin properties and flag likely host matches. */
export async function discoverGoogleProperties(host: string): Promise<GooglePropertyDiscovery> {
  const out: GooglePropertyDiscovery = { configured: true, gsc: [], ga4: [], warnings: [] };
  try {
    const token = await getGoogleAccessToken([GSC_SCOPE, GA4_SCOPE]);
    const [gscRes, gaRes] = await Promise.all([
      fetch(`${GSC_API}/sites`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }),
      fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }),
    ]);

    if (gscRes.ok) {
      const body = await gscRes.json();
      out.gsc = (body?.siteEntry ?? []).map((item: Record<string, string>) => ({
        id: item.siteUrl,
        label: item.siteUrl,
        url: item.siteUrl,
        matched: matchesHost(item.siteUrl, host),
      } satisfies GooglePropertyCandidate));
    } else {
      out.warnings.push(`Search Console discovery returned ${gscRes.status}.`);
    }

    if (gaRes.ok) {
      const body = await gaRes.json();
      const candidates: GooglePropertyCandidate[] = [];
      for (const account of body?.accountSummaries ?? []) {
        for (const property of account?.propertySummaries ?? []) {
          const id = String(property.property ?? "").replace("properties/", "");
          const label = `${property.displayName ?? id} · ${account.displayName ?? "Google Analytics"}`;
          candidates.push({ id, label, url: null, matched: matchesHost(property.displayName, host) });
        }
      }
      out.ga4 = candidates;
    } else {
      out.warnings.push(`Analytics property discovery returned ${gaRes.status}.`);
    }
    return out;
  } catch (error) {
    return {
      configured: false,
      gsc: [],
      ga4: [],
      warnings: [error instanceof Error ? error.message : "Google discovery failed."],
    };
  }
}
