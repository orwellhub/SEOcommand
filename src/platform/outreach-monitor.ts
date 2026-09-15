import { createHash } from "node:crypto";
import { mailConfigured } from "@/providers/google/mail";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { saveCommandRecord } from "./command-store";
import { createNotification } from "./notifications";
import { fetchPublic, readBoundedText } from "./public-network";
import { readMailThread } from "@/providers/google/mail";

export async function syncOutreachReplies(site: string, draftId: string) {
  const [draft] = await db().select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, draftId), eq(schema.outreachDrafts.siteSlug, site)));
  const threadId = draft?.delivery.threadId;
  if (!draft?.recipientEmail || typeof threadId !== "string") throw new Error("This message has no saved Gmail thread. New messages sent through the connected mailbox can receive replies here.");
  const replies = await readMailThread(threadId, draft.recipientEmail);
  return saveCommandRecord(site, "workspace_replies", draftId, { draftId, threadId, checkedAt: new Date().toISOString(), replies }, { status: "saved" });
}
export function findAcquiredLink(html: string, sourceUrl: string, targetUrl: string) {
  const target = new URL(targetUrl); target.hash = "";
  for (const match of html.matchAll(/<a\b([^>]+)>/gi)) {
    const href = match[1]!.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    try { const url = new URL((href?.[1] ?? href?.[2] ?? href?.[3] ?? "").replace(/&amp;/g, "&"), sourceUrl); url.hash = ""; if (url.toString() === target.toString()) return { found: true, nofollow: /\brel\s*=\s*["'][^"']*\bnofollow\b/i.test(match[1]!), sponsored: /\brel\s*=\s*["'][^"']*\bsponsored\b/i.test(match[1]!) }; } catch { /* Invalid markup is not a confirmed link. */ }
  }
  return { found: false, nofollow: null, sponsored: null };
}
export async function verifyAcquiredLink(site: string, sourceUrl: string, targetUrl: string, actor?: string) {
  const response = await fetchPublic(sourceUrl, { headers: { "user-agent": "OrwellSEOCommand/2.0 (+acquired link check)" }, signal: AbortSignal.timeout(15000) });
  const html = response.ok && response.headers.get("content-type")?.includes("html") ? await readBoundedText(response) : null;
  const evidence = html == null ? { found: null, nofollow: null, sponsored: null } : findAcquiredLink(html, response.url || sourceUrl, targetUrl);
  return saveCommandRecord(site, "workspace_link_check", crypto.randomUUID(), { sourceUrl, targetUrl, statusCode: response.status, checkedAt: new Date().toISOString(), ...evidence, note: "Checks returned HTML only; JavaScript-inserted links may be absent. A blocked page is unknown, not a lost link." }, { actor, status: "completed" });
}
export async function outreachEvidence(site: string) {
  return db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, site), inArray(schema.commandRecords.kind, ["workspace_replies", "workspace_followup", "workspace_link_check", "workspace_link_monitor", "workspace_outreach_settings", "workspace_reply_draft"]))).orderBy(desc(schema.commandRecords.updatedAt)).limit(100);
}
export async function notifyOutreachFollowups() {
  const due = await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.kind, "workspace_followup"), eq(schema.commandRecords.status, "active"), lte(schema.commandRecords.nextRunAt, new Date()))).limit(50);
  for (const row of due) {
    await createNotification({ siteSlug: row.siteSlug, eventType: "outreach_followup", severity: "medium", title: String(row.payload.title), detail: "Review the conversation before preparing a follow-up. No email has been sent.", actionUrl: `/link-building?site=${row.siteSlug}`, fingerprint: `followup:${row.id}` });
    await db().update(schema.commandRecords).set({ status: "notified", updatedAt: new Date(), nextRunAt: null }).where(and(eq(schema.commandRecords.id, row.id), eq(schema.commandRecords.status, "active")));
  }
}

export async function monitorAcquiredLink(site: string, sourceUrl: string, targetUrl: string) {
  const key = createHash("sha256").update(`${sourceUrl}\n${targetUrl}`).digest("hex");
  return saveCommandRecord(site, "workspace_link_monitor", key, { sourceUrl, targetUrl, cadence: "weekly" }, { status: "active", nextRunAt: new Date() });
}
/** Opt-in, bounded hourly work. This function never sends messages. */
export async function processOutreachMonitoring(shouldStop: () => boolean = () => false) {
  if (process.env.QA_SYNTHETIC === "true") return;
  const records = schema.commandRecords, now = new Date();
  const settings = await db().select().from(records).where(and(eq(records.kind, "workspace_outreach_settings"), eq(records.status, "active"))).limit(50);
  if (mailConfigured()) for (const setting of settings) {
    if (shouldStop()) return;
    const drafts = await db().select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.siteSlug, setting.siteSlug), eq(schema.outreachDrafts.status, "sent"))).orderBy(desc(schema.outreachDrafts.sentAt)).limit(20);
    for (const draft of drafts) {
      if (shouldStop()) return;
      try { await syncOutreachReplies(setting.siteSlug, draft.id); } catch { /* Keep previously saved replies if the mailbox cannot be reached. */ }
    }
  }
  const due = await db().select().from(records).where(and(eq(records.kind, "workspace_link_monitor"), eq(records.status, "active"), lte(records.nextRunAt, now))).limit(20);
  for (const row of due) {
    if (shouldStop()) return;
    const next = new Date(now.getTime() + 7 * 86400000);
    const [claimed] = await db().update(records).set({ nextRunAt: next, updatedAt: now }).where(and(eq(records.id, row.id), eq(records.updatedAt, row.updatedAt), eq(records.status, "active"))).returning();
    if (!claimed) continue;
    try {
      const evidence = await verifyAcquiredLink(row.siteSlug, String(row.payload.sourceUrl), String(row.payload.targetUrl));
      await db().update(records).set({ payload: { ...row.payload, lastCheckId: evidence.id, lastFound: evidence.payload.found, checkedAt: now.toISOString() }, updatedAt: new Date() }).where(eq(records.id, row.id));
      if (row.payload.lastFound === true && evidence.payload.found === false) await createNotification({ siteSlug: row.siteSlug, eventType: "acquired_link_missing", severity: "high", title: "An acquired link needs review", detail: String(row.payload.sourceUrl), actionUrl: `/link-building?site=${row.siteSlug}`, fingerprint: `acquired-link:${row.id}` });
    } catch (error) { await db().update(records).set({ payload: { ...row.payload, lastError: error instanceof Error ? error.message : "Link check failed", lastFound: row.payload.lastFound ?? null }, updatedAt: new Date() }).where(eq(records.id, row.id)); }
  }
}
