import { createHash } from "node:crypto";
import tls from "node:tls";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ManagedSite } from "./types";
import { createNotification } from "./notifications";
import { assertPublicHostname, fetchPublic } from "./public-network";

const USER_AGENT = "OrwellSEOCommand/2.0 (+reliability monitoring)";

export interface ReliabilityResult {
  available: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  tlsValid: boolean | null;
  tlsExpiresAt: Date | null;
  domainExpiresAt: Date | null;
  robotsStatus: number | null;
  robotsHash: string | null;
  sitemapStatus: number | null;
  sitemapHash: string | null;
  homepageHash: string | null;
  details: Record<string, unknown>;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchEvidence(url: string, timeoutMs = 15_000) {
  const started = Date.now();
  try {
    const response = await fetchPublic(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const text = (await response.text()).slice(0, 2_000_000);
    return { status: response.status, elapsed: Date.now() - started, text, finalUrl: response.url, error: null as string | null };
  } catch (error) {
    return { status: null, elapsed: Date.now() - started, text: "", finalUrl: url, error: error instanceof Error ? error.message : String(error) };
  }
}

async function tlsEvidence(host: string): Promise<{ valid: boolean | null; expiresAt: Date | null; error?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const certificate = socket.getPeerCertificate();
      const expiresAt = certificate.valid_to ? new Date(certificate.valid_to) : null;
      const valid = socket.authorized && Boolean(expiresAt && expiresAt.getTime() > Date.now());
      socket.end();
      resolve({ valid, expiresAt, error: socket.authorizationError?.message });
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ valid: null, expiresAt: null, error: "TLS connection timed out." });
    });
    socket.once("error", (error) => resolve({ valid: false, expiresAt: null, error: error.message }));
  });
}

function rdapExpiry(events: unknown): Date | null {
  if (!Array.isArray(events)) return null;
  const expiry = events.find((event) => {
    if (!event || typeof event !== "object") return false;
    return /expir/i.test(String((event as Record<string, unknown>).eventAction ?? ""));
  }) as Record<string, unknown> | undefined;
  const value = expiry?.eventDate;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function domainExpiry(host: string): Promise<Date | null> {
  try {
    const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(host.replace(/^www\./, ""))}`, {
      headers: { accept: "application/rdap+json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = await response.json() as { events?: unknown };
    return rdapExpiry(body.events);
  } catch {
    return null;
  }
}

export async function checkReliability(site: ManagedSite, now = new Date()): Promise<ReliabilityResult> {
  await assertPublicHostname(site.host);
  const [previous] = await db().select().from(schema.reliabilityChecks)
    .where(eq(schema.reliabilityChecks.siteSlug, site.id))
    .orderBy(desc(schema.reliabilityChecks.checkedAt)).limit(1);
  const [home, robots, sitemap, tlsInfo] = await Promise.all([
    fetchEvidence(`https://${site.host}/`),
    fetchEvidence(`https://${site.host}/robots.txt`, 10_000),
    fetchEvidence(`https://${site.host}/sitemap.xml`, 10_000),
    tlsEvidence(site.host),
  ]);
  const shouldRefreshDomain = !previous?.domainExpiresAt || now.getTime() - previous.checkedAt.getTime() > 6 * 24 * 60 * 60 * 1_000;
  const expiresAt = shouldRefreshDomain ? await domainExpiry(site.host) : previous.domainExpiresAt;
  const result: ReliabilityResult = {
    available: home.status != null && home.status < 500,
    statusCode: home.status,
    responseTimeMs: home.elapsed,
    tlsValid: tlsInfo.valid,
    tlsExpiresAt: tlsInfo.expiresAt,
    domainExpiresAt: expiresAt ?? null,
    robotsStatus: robots.status,
    robotsHash: robots.text ? digest(robots.text) : null,
    sitemapStatus: sitemap.status,
    sitemapHash: sitemap.text ? digest(sitemap.text) : null,
    homepageHash: home.text ? digest(home.text) : null,
    details: { finalUrl: home.finalUrl, homeError: home.error, tlsError: tlsInfo.error ?? null },
  };
  await db().insert(schema.reliabilityChecks).values({ siteSlug: site.id, checkedAt: now, ...result });

  const hour = now.toISOString().slice(0, 13);
  if (!result.available && previous?.available !== false) {
    await createNotification({
      siteSlug: site.id,
      eventType: "site_unavailable",
      severity: "critical",
      title: `${site.name} is unavailable`,
      detail: home.error || `Homepage returned HTTP ${home.status ?? "unknown"}.`,
      actionUrl: "/monitoring",
      fingerprint: `uptime-down:${site.id}:${hour}`,
    });
  }
  if (result.available && previous?.available === false) {
    await createNotification({
      siteSlug: site.id,
      eventType: "site_recovered",
      severity: "low",
      title: `${site.name} recovered`,
      detail: `Homepage returned HTTP ${result.statusCode} in ${result.responseTimeMs} ms.`,
      actionUrl: "/monitoring",
      fingerprint: `uptime-up:${site.id}:${hour}`,
    });
  }
  const tlsDays = result.tlsExpiresAt ? Math.ceil((result.tlsExpiresAt.getTime() - now.getTime()) / 86_400_000) : null;
  if (result.tlsValid === false || (tlsDays != null && tlsDays <= 21)) {
    await createNotification({
      siteSlug: site.id,
      eventType: "tls_risk",
      severity: result.tlsValid === false || (tlsDays ?? 99) <= 7 ? "critical" : "high",
      title: result.tlsValid === false ? `${site.name} has an invalid TLS certificate` : `${site.name} TLS expires in ${tlsDays} days`,
      detail: tlsInfo.error ?? "Renew the certificate before visitors receive a security warning.",
      actionUrl: "/monitoring",
      fingerprint: `tls:${site.id}:${now.toISOString().slice(0, 10)}`,
    });
  }
  const domainDays = result.domainExpiresAt ? Math.ceil((result.domainExpiresAt.getTime() - now.getTime()) / 86_400_000) : null;
  if (domainDays != null && domainDays <= 45) {
    await createNotification({
      siteSlug: site.id,
      eventType: "domain_expiry",
      severity: domainDays <= 14 ? "critical" : "high",
      title: `${site.name} domain expires in ${domainDays} days`,
      detail: "Confirm auto-renewal and payment details with the registrar.",
      actionUrl: "/monitoring",
      fingerprint: `domain-expiry:${site.id}:${now.toISOString().slice(0, 10)}`,
    });
  }
  for (const [kind, current, prior] of [
    ["robots", result.robotsHash, previous?.robotsHash],
    ["sitemap", result.sitemapHash, previous?.sitemapHash],
  ] as const) {
    if (current && prior && current !== prior) {
      await createNotification({
        siteSlug: site.id,
        eventType: `${kind}_changed`,
        severity: "medium",
        title: `${site.name} ${kind === "robots" ? "robots.txt" : "sitemap.xml"} changed`,
        detail: "Review the change for accidental crawling or indexation restrictions.",
        actionUrl: "/monitoring",
        fingerprint: `${kind}-changed:${site.id}:${hour}`,
      });
    }
  }
  return result;
}

export async function reliabilityDashboard(siteSlugs: string[]) {
  const rows = siteSlugs.length
    ? await db().select().from(schema.reliabilityChecks)
      .where(inArray(schema.reliabilityChecks.siteSlug, siteSlugs))
      .orderBy(desc(schema.reliabilityChecks.checkedAt)).limit(Math.min(siteSlugs.length * 30, 10_000))
    : [];
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.siteSlug)) latest.set(row.siteSlug, row);
  const recent = rows.filter((row) => row.checkedAt.getTime() >= Date.now() - 24 * 60 * 60 * 1_000);
  const avgResponse = recent.length ? Math.round(recent.reduce((sum, row) => sum + (row.responseTimeMs ?? 0), 0) / recent.length) : null;
  const uptimePct = recent.length ? Math.round((recent.filter((row) => row.available).length / recent.length) * 1_000) / 10 : null;
  return {
    summary: {
      monitored: latest.size,
      available: [...latest.values()].filter((row) => row.available).length,
      incidents: [...latest.values()].filter((row) => !row.available || row.tlsValid === false).length,
      avgResponseMs: avgResponse,
      uptimePct,
    },
    latest: [...latest.values()],
    checks: rows.slice(0, 500),
  };
}
