import { readFile } from "node:fs/promises";
import { fetchPublic } from "@/platform/public-network";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildSiteCommand } from "@/platform/command-read";
import { getManagedSite, listManagedSites, resolveGroupSiteSlugs } from "@/platform/site-store";
import { rankPreview } from "@/platform/rank-preview";
import { rankReportRows } from "@/lib/rank-reports";
import { resolveReportBranding } from "./branding";
import { reportDefinition } from "./definition";
import { escapeReport, renderReportDocument, reportTable } from "./document";
export type ReportScope = { scopeType: "site" | "portfolio" | "group" | "campaign"; scopeId?: string | null; templateId?: string; definition?: Record<string, unknown> };
export async function reportScopeSites(scope: ReportScope): Promise<string[]> {
  if (scope.scopeType === "site") return scope.scopeId && await getManagedSite(scope.scopeId) ? [scope.scopeId] : [];
  if (scope.scopeType === "group") return scope.scopeId ? resolveGroupSiteSlugs(scope.scopeId) : [];
  if (scope.scopeType === "campaign") {
    if (!scope.scopeId) return [];
    if (process.env.QA_SYNTHETIC === "true") { for (const site of await listManagedSites()) if ((await rankPreview(site.id)).campaigns.some(c => c.id === scope.scopeId)) return [site.id]; return []; }
    const [campaign] = await db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.id, scope.scopeId)).limit(1);
    return campaign ? [campaign.siteSlug] : [];
  }
  return (await listManagedSites()).map(s => s.id);
}
export async function buildReportHtml(scope: ReportScope, allowedSites?: string[]): Promise<string> {
  const selected = await reportScopeSites(scope), slugs = allowedSites ? selected.filter(s => allowedSites.includes(s)) : selected;
  if (!slugs.length) throw new Error("No websites available for this report scope.");
  const definition = reportDefinition(scope.templateId, scope.definition);
  const first = (await getManagedSite(slugs[0]!))!, branding = resolveReportBranding(first);
  let campaignHtml: string | undefined;
  if (scope.scopeType === "campaign") {
    const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - (definition.days - 1) * 86400000).toISOString().slice(0, 10);
    const workspace = process.env.QA_SYNTHETIC === "true" ? await rankPreview(first.id) : {
      campaigns: await db().select().from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.id, scope.scopeId!)),
      keywords: await db().select().from(schema.rankTrackingKeywords).where(eq(schema.rankTrackingKeywords.campaignId, scope.scopeId!)),
      history: await db().select().from(schema.dailyRankHistory).where(and(eq(schema.dailyRankHistory.siteSlug, first.id), gte(schema.dailyRankHistory.capturedOn, from), lte(schema.dailyRankHistory.capturedOn, to))),
    };
    const campaign = workspace.campaigns.find(c => c.id === scope.scopeId), rows = rankReportRows(workspace.keywords.filter(k => k.campaignId === scope.scopeId), workspace.history, from, to);
    campaignHtml = `<h2>${escapeReport(campaign?.name ?? "Tracking campaign")}</h2><p>${from} to ${to}. ${rows.filter(r => r.observed).length} of ${rows.length} targets have observations. Paused targets are labelled; missing checks remain unknown.</p>${reportTable(["Keyword", "Market / device", "Status", "First", "Latest", "Change", "Checked"], rows.map(r => [r.keyword, `${r.locationCode} / ${r.device}`, r.active ? "Active" : "Paused", r.previous, r.position, r.change, r.lastChecked]))}`;
  }
  const sites = await Promise.all(slugs.map(buildSiteCommand));
  let logoData: string | undefined, fontData: string | undefined;
  try { fontData = (await readFile(process.cwd() + "/src/assets/manrope-latin.woff2")).toString("base64"); } catch { /* Font fallback keeps reports readable. */ }
  if (branding.logoUrl) try {
    const response = await fetchPublic(branding.logoUrl, { signal: AbortSignal.timeout(5000) });
    const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (response.ok && ["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
      if (reader) try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 1000000) throw new Error("Logo too large"); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
      logoData = `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
    }
  } catch { /* An unavailable logo must not discard the report evidence. */ }
  return renderReportDocument({ sites, branding, definition, logoData, fontData, scopeLabel: scope.scopeType === "site" ? first.name : `${scope.scopeType} report · ${slugs.length} website${slugs.length === 1 ? "" : "s"}`, campaignHtml });
}
