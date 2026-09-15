import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildReportHtml } from "./build";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { reportDefinition } from "./definition";
import { saveCommandRecord } from "@/platform/command-store";

export const shareHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function reportHtml(siteSlug: string, templateId = "tpl-domain", definition: Record<string, unknown> = {}) {
  return buildReportHtml({ scopeType: "site", scopeId: siteSlug, templateId, definition });
}
export async function renderReportPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  try { const page = await browser.newPage({ javaScriptEnabled: false }); await page.route("**/*", (route) => route.abort()); await page.setContent(html, { waitUntil: "load" }); return await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" } }); } finally { await browser.close(); }
}
export function reportBrowserAvailable() { return existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath()); }
export async function archiveReport(siteSlug: string, actor: string, templateId = "tpl-domain", definition: Record<string, unknown> = {}) {
  const html = await reportHtml(siteSlug, templateId, definition), pdf = reportBrowserAvailable() ? await renderReportPdf(html) : null;
  return saveCommandRecord(siteSlug, "workspace_report", crypto.randomUUID(), { html, ...(pdf ? { pdf: pdf.toString("base64") } : {}), title: REPORT_TEMPLATES.find(t => t.id === templateId)!.name, definition: reportDefinition(templateId, definition), generatedAt: new Date().toISOString() }, { actor, status: pdf ? "ready" : "queued" });
}
/** The existing browser worker renders saved HTML without fetching fresh or paid data. */
export async function processReportArchives(shouldStop: () => boolean = () => false) {
  if (process.env.QA_SYNTHETIC === "true" || !reportBrowserAvailable()) return;
  const records = schema.commandRecords;
  await db().update(records).set({ status: "queued", updatedAt: new Date() }).where(and(eq(records.kind, "workspace_report"), eq(records.status, "rendering"), lte(records.updatedAt, new Date(Date.now() - 15 * 60000))));
  const due = await db().select({ id: records.id }).from(records).where(and(eq(records.kind, "workspace_report"), eq(records.status, "queued"))).orderBy(records.createdAt).limit(10);
  for (const item of due) {
    if (shouldStop()) break;
    const [row] = await db().update(records).set({ status: "rendering", updatedAt: new Date() }).where(and(eq(records.id, item.id), eq(records.status, "queued"))).returning();
    if (!row) continue;
    const owns = and(eq(records.id, row.id), eq(records.updatedAt, row.updatedAt), eq(records.status, "rendering"));
    try {
      const pdf = await renderReportPdf(String(row.payload.html));
      await db().update(records).set({ status: "ready", updatedAt: new Date(), payload: sql`${records.payload} || ${JSON.stringify({ pdf: pdf.toString("base64"), renderedAt: new Date().toISOString(), error: null })}::jsonb` }).where(owns);
    } catch {
      await db().update(records).set({ status: "failed", updatedAt: new Date(), payload: sql`${records.payload} || '{"error":"PDF rendering failed. The saved report is retained; retry PDF generation."}'::jsonb` }).where(owns);
    }
  }
}
export async function reportArchives(siteSlug: string) {
  return db().select({ id: schema.commandRecords.id, recordKey: schema.commandRecords.recordKey, status: schema.commandRecords.status, createdAt: schema.commandRecords.createdAt }).from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), eq(schema.commandRecords.kind, "workspace_report"))).orderBy(desc(schema.commandRecords.createdAt)).limit(30);
}
export async function reportById(siteSlug: string, id: string) {
  const [row] = await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), eq(schema.commandRecords.id, id), eq(schema.commandRecords.kind, "workspace_report")));
  return row;
}
export async function shareReport(siteSlug: string, reportId: string, actor: string) {
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await saveCommandRecord(siteSlug, "workspace_share", shareHash(token), { reportId, expiresAt }, { actor, status: "active" });
  return { token, expiresAt };
}
