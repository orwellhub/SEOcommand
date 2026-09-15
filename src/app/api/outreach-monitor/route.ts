import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";
import { saveCommandRecord } from "@/platform/command-store";
import { outreachEvidence, syncOutreachReplies, verifyAcquiredLink, monitorAcquiredLink } from "@/platform/outreach-monitor";
import { mailConfigured, sendMail } from "@/providers/google/mail";
import { siteUrl } from "@/lib/command-model";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site") ?? "";
  if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ records: [], drafts: [], connected: false });
  const drafts = await db().select({ id: schema.outreachDrafts.id, subject: schema.outreachDrafts.subject, recipientEmail: schema.outreachDrafts.recipientEmail, status: schema.outreachDrafts.status }).from(schema.outreachDrafts).where(eq(schema.outreachDrafts.siteSlug, site));
  return NextResponse.json({ records: await outreachEvidence(site), drafts, connected: mailConfigured() });
}
const inputSchema = z.object({ action: z.enum(["replies", "followup", "complete", "verify", "monitor", "stop_monitor", "auto_refresh", "reply_draft", "send_reply"]), site: z.string().min(1).max(120), text: z.string().trim().min(1).max(20000).optional(), enabled: z.boolean().optional(), draftId: z.string().uuid().optional(), id: z.string().uuid().optional(), title: z.string().trim().min(2).max(200).optional(), due: z.string().datetime().optional(), sourceUrl: z.string().url().max(2000).optional(), targetUrl: z.string().max(2000).optional() });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review these outreach details." }, { status: 400 });
  const input = parsed.data;
  if (!await canAccessSite(request, input.site) || !await hasPermission(request, "manage_content", input.site)) return NextResponse.json({ error: "Outreach access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ error: "External outreach checks are disabled in preview." }, { status: 409 });
  try {
    const site = await getManagedSite(input.site); if (!site) throw new Error("Website not found.");
    if (input.draftId) {
      const [draft] = await db().select({ id: schema.outreachDrafts.id }).from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, input.draftId), eq(schema.outreachDrafts.siteSlug, site.id)));
      if (!draft) throw new Error("Choose a message from this website.");
    }
    if (input.action === "auto_refresh") await saveCommandRecord(site.id, "workspace_outreach_settings", "settings", { autoRefresh: input.enabled === true }, { status: input.enabled ? "active" : "paused" });
    if (input.action === "monitor") { const target = input.targetUrl ? siteUrl(input.targetUrl, site.host) : null; if (!target || !input.sourceUrl) throw new Error("Choose a linking page and an owned target URL."); await monitorAcquiredLink(site.id, input.sourceUrl, target); }
    if (input.action === "stop_monitor") { if (!input.id) throw new Error("Choose a link monitor."); await db().update(schema.commandRecords).set({ status: "paused", nextRunAt: null, updatedAt: new Date() }).where(and(eq(schema.commandRecords.id, input.id), eq(schema.commandRecords.siteSlug, site.id), eq(schema.commandRecords.kind, "workspace_link_monitor"))); }
    if (input.action === "reply_draft") {
      if (!input.text || !input.draftId) throw new Error("Choose a sent conversation and write a reply.");
      const [draft] = await db().select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, input.draftId), eq(schema.outreachDrafts.siteSlug, site.id)));
      if (!draft?.recipientEmail || typeof draft.delivery.threadId !== "string") throw new Error("This conversation has no connected Gmail thread.");
      const record = await saveCommandRecord(site.id, "workspace_reply_draft", crypto.randomUUID(), { draftId: draft.id, recipient: draft.recipientEmail, subject: /^re:/i.test(draft.subject) ? draft.subject : `Re: ${draft.subject}`, text: input.text }, { status: "draft" });
      return NextResponse.json({ record, message: "Reply saved for review. Nothing has been sent." });
    }
    if (input.action === "send_reply") {
      if (!input.id) throw new Error("Choose a saved reply draft.");
      const [reply] = await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.id, input.id), eq(schema.commandRecords.siteSlug, site.id), eq(schema.commandRecords.kind, "workspace_reply_draft"), eq(schema.commandRecords.status, "draft")));
      if (!reply) throw new Error("This reply is no longer an unsent draft.");
      const [draft] = await db().select().from(schema.outreachDrafts).where(and(eq(schema.outreachDrafts.id, String(reply.payload.draftId)), eq(schema.outreachDrafts.siteSlug, site.id)));
      if (!draft?.recipientEmail || typeof draft.delivery.threadId !== "string") throw new Error("Original mailbox thread is unavailable.");
      const synced = await syncOutreachReplies(site.id, draft.id);
      const incoming = synced.payload.replies as { messageId?: string | null }[];
      const messageId = incoming.at(-1)?.messageId;
      if (!messageId) throw new Error("Sync a received reply with its email header before replying in this thread.");
      const [claimed] = await db().update(schema.commandRecords).set({ status: "sending", updatedAt: new Date() }).where(and(eq(schema.commandRecords.id, reply.id), eq(schema.commandRecords.status, "draft"), sql`date_trunc('milliseconds', ${schema.commandRecords.updatedAt}) = ${reply.updatedAt}`)).returning();
      if (!claimed) throw new Error("Reply changed or already submitted. Reopen the conversation.");
      const sent = await sendMail({ id: reply.id, to: [draft.recipientEmail], subject: String(reply.payload.subject), text: String(reply.payload.text), threadId: draft.delivery.threadId, inReplyTo: messageId });
      await db().update(schema.commandRecords).set({ status: "sent", payload: { ...reply.payload, sentAt: new Date().toISOString(), messageId: sent.id }, updatedAt: new Date() }).where(eq(schema.commandRecords.id, reply.id));
      return NextResponse.json({ message: "Reply accepted by Gmail. Saved in the original conversation." });
    }
    if (input.action === "replies") { if (!input.draftId) throw new Error("Choose a sent message."); await syncOutreachReplies(site.id, input.draftId); }
    if (input.action === "followup") { if (!input.title || !input.due || Date.parse(input.due) <= Date.now()) throw new Error("Add a follow-up title and future date."); await saveCommandRecord(site.id, "workspace_followup", crypto.randomUUID(), { title: input.title, draftId: input.draftId }, { status: "active", nextRunAt: new Date(input.due) }); }
    if (input.action === "complete") { if (!input.id) throw new Error("Choose a reminder."); await db().update(schema.commandRecords).set({ status: "done", nextRunAt: null, updatedAt: new Date() }).where(and(eq(schema.commandRecords.id, input.id), eq(schema.commandRecords.siteSlug, site.id), eq(schema.commandRecords.kind, "workspace_followup"))); }
    if (input.action === "verify") { const target = input.targetUrl ? siteUrl(input.targetUrl, site.host) : null; if (!target || !input.sourceUrl) throw new Error("Enter a linking page and a target page on this website."); await verifyAcquiredLink(site.id, input.sourceUrl, target); }
    return NextResponse.json({ message: input.action === "monitor" ? "Weekly link monitoring enabled." : input.action === "auto_refresh" ? "Inbox refresh preference saved." : input.action === "stop_monitor" ? "Link monitoring paused." : input.action === "replies" ? "Replies checked and saved." : input.action === "verify" ? "Link evidence collected." : "Follow-up saved." });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Outreach action failed." }, { status: 400 }); }
}
