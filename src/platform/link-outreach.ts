import { createHmac } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getManagedSite } from "./site-store";
import { fetchPublic } from "./public-network";

export const LINK_QUALITY_THRESHOLDS = {
  minimum: { relevance: 60, authority: 20, competitorMatches: 1 },
  strong: { relevance: 70, authority: 40, competitorMatches: 2 },
} as const;

export function qualifyLinkProspect(prospect: { relevance: number; authority: number | null; competitorHosts: string[]; contacts?: Array<{ type?: string; value?: string }> | null; status?: string }) {
  const authority = prospect.authority ?? 0;
  const misses: string[] = [];
  if (prospect.relevance < LINK_QUALITY_THRESHOLDS.minimum.relevance) misses.push(`Fit below ${LINK_QUALITY_THRESHOLDS.minimum.relevance}`);
  if (authority < LINK_QUALITY_THRESHOLDS.minimum.authority) misses.push(`Authority below ${LINK_QUALITY_THRESHOLDS.minimum.authority}`);
  if (prospect.competitorHosts.length < LINK_QUALITY_THRESHOLDS.minimum.competitorMatches) misses.push("No competitor link evidence");
  const eligible = misses.length === 0;
  const strong = eligible && prospect.relevance >= LINK_QUALITY_THRESHOLDS.strong.relevance && authority >= LINK_QUALITY_THRESHOLDS.strong.authority && prospect.competitorHosts.length >= LINK_QUALITY_THRESHOLDS.strong.competitorMatches;
  const contacts = prospect.contacts ?? [];
  return {
    quality: { state: strong ? "strong" : eligible ? "qualified" : "review", eligible, reasons: misses },
    contactState: contacts.some((item) => item.type === "email" && item.value) ? "email_found" : contacts.some((item) => item.type === "contact_page") ? "contact_page" : "not_researched",
    outreachStatus: prospect.status ?? "discovered",
    traffic: null,
  };
}

function extractEmails(html: string): string[] {
  const found = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(found.map((email) => email.toLowerCase()).filter((email) => !/example\.|sentry\.|wixpress|cloudflare/i.test(email)))].slice(0, 10);
}

function extractContactUrls(html: string, base: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    if (!/(contact|about|editorial|write-for-us)/i.test(match[1]!)) continue;
    try {
      const url = new URL(match[1]!, base);
      if (url.hostname === new URL(base).hostname && /^https?:$/.test(url.protocol)) values.push(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }
  return [...new Set(values)].slice(0, 3);
}

export async function enrichProspectContacts(prospectId: string) {
  const [prospect] = await db().select().from(schema.linkProspects).where(eq(schema.linkProspects.id, prospectId)).limit(1);
  if (!prospect) throw new Error("Link prospect not found.");
  const home = `https://${prospect.sourceDomain}/`;
  const contacts: Array<Record<string, unknown>> = [];
  try {
    const response = await fetchPublic(home, { headers: { "user-agent": "OrwellSEOCommand/2.0 (+link prospect research)" }, signal: AbortSignal.timeout(12_000) });
    const html = response.ok ? (await response.text()).slice(0, 2_000_000) : "";
    for (const email of extractEmails(html)) contacts.push({ type: "email", value: email, source: response.url });
    for (const contactUrl of extractContactUrls(html, response.url)) {
      if (contacts.filter((item) => item.type === "email").length >= 5) break;
      try {
        const contactResponse = await fetchPublic(contactUrl, { headers: { "user-agent": "OrwellSEOCommand/2.0 (+link prospect research)" }, signal: AbortSignal.timeout(10_000) });
        const contactHtml = contactResponse.ok ? (await contactResponse.text()).slice(0, 1_000_000) : "";
        for (const email of extractEmails(contactHtml)) contacts.push({ type: "email", value: email, source: contactResponse.url });
        contacts.push({ type: "contact_page", value: contactResponse.url, source: contactResponse.url });
      } catch {
        // One failed contact page does not invalidate the prospect.
      }
    }
  } catch {
    contacts.push({ type: "contact_page", value: home, source: home, unavailable: true });
  }
  const unique = [...new Map(contacts.map((item) => [`${item.type}:${item.value}`, item])).values()];
  await db().update(schema.linkProspects).set({ contacts: unique, updatedAt: new Date() }).where(eq(schema.linkProspects.id, prospect.id));
  return unique;
}

export async function createOutreachDraft(input: { prospectId: string; recipientEmail?: string | null; angle?: string | null }) {
  const [prospect] = await db().select().from(schema.linkProspects).where(eq(schema.linkProspects.id, input.prospectId)).limit(1);
  if (!prospect) throw new Error("Link prospect not found.");
  if (!qualifyLinkProspect({ ...prospect, contacts: prospect.contacts as Array<{ type?: string; value?: string }> }).quality.eligible) throw new Error("This prospect does not meet the visible quality thresholds for outreach.");
  const site = await getManagedSite(prospect.siteSlug);
  if (!site) throw new Error("Website not found.");
  const angle = input.angle?.trim() || `a useful resource for readers researching ${site.industry}`;
  const subject = `Resource suggestion for ${prospect.sourceDomain}`;
  const body = [
    "Hello,",
    "",
    `I was reviewing ${prospect.sourceDomain} while researching ${site.industry} resources and noticed the site references several organisations in this area.`,
    "",
    `${site.name} (${site.host}) may also be relevant as ${angle}. If it genuinely improves the page, would you consider including it?`,
    "",
    "I can send a more specific page suggestion if useful.",
    "",
    "Kind regards,",
  ].join("\n");
  const [draft] = await db().insert(schema.outreachDrafts).values({
    prospectId: prospect.id,
    siteSlug: site.id,
    recipientEmail: input.recipientEmail || null,
    subject,
    body,
  }).returning();
  await db().update(schema.linkProspects).set({ status: "drafted", updatedAt: new Date() }).where(eq(schema.linkProspects.id, prospect.id));
  return draft!;
}

export async function approveOutreachDraft(id: string, approvedBy: string | null) {
  const [draft] = await db().update(schema.outreachDrafts).set({
    status: "approved",
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(schema.outreachDrafts.id, id), eq(schema.outreachDrafts.status, "draft"))).returning();
  if (!draft) throw new Error("Only a draft can be approved.");
  return draft;
}

export async function sendApprovedOutreach(id: string) {
  const [approved] = await db().select().from(schema.outreachDrafts)
    .where(and(eq(schema.outreachDrafts.id, id), eq(schema.outreachDrafts.status, "approved"))).limit(1);
  if (!approved) throw new Error("This message must be approved before it can be sent.");
  if (!approved.recipientEmail) throw new Error("Add a verified recipient email before sending.");
  const webhook = process.env.OUTREACH_EMAIL_WEBHOOK_URL;
  if (!webhook) throw new Error("Outreach delivery is not configured.");
  const url = new URL(webhook);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Outreach webhook must use HTTPS.");
  const [draft] = await db().update(schema.outreachDrafts).set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(schema.outreachDrafts.id, id), eq(schema.outreachDrafts.status, "approved"))).returning();
  if (!draft) throw new Error("This message is already being sent.");
  const payload = JSON.stringify({
    event: "seo.outreach.approved",
    message: { id: draft.id, to: draft.recipientEmail, subject: draft.subject, body: draft.body },
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.OUTREACH_WEBHOOK_SECRET) {
    headers["x-orwell-signature"] = `sha256=${createHmac("sha256", process.env.OUTREACH_WEBHOOK_SECRET).update(payload).digest("hex")}`;
  }
  try {
    const response = await fetch(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Delivery provider returned HTTP ${response.status}.`);
    const delivery = await response.json().catch(() => ({})) as Record<string, unknown>;
    await db().update(schema.outreachDrafts).set({ status: "sent", sentAt: new Date(), delivery, updatedAt: new Date() }).where(eq(schema.outreachDrafts.id, id));
    await db().update(schema.linkProspects).set({ status: "contacted", updatedAt: new Date() }).where(eq(schema.linkProspects.id, draft.prospectId));
    return { ok: true, delivery };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db().update(schema.outreachDrafts).set({ status: "approved", delivery: { error: message }, updatedAt: new Date() }).where(eq(schema.outreachDrafts.id, id));
    throw error;
  }
}

export async function linkBuildingDashboard(siteSlug: string) {
  const [prospects, drafts] = await Promise.all([
    db().select().from(schema.linkProspects).where(eq(schema.linkProspects.siteSlug, siteSlug)).orderBy(desc(schema.linkProspects.relevance), desc(schema.linkProspects.discoveredAt)).limit(500),
    db().select().from(schema.outreachDrafts).where(eq(schema.outreachDrafts.siteSlug, siteSlug)).orderBy(desc(schema.outreachDrafts.createdAt)).limit(250),
  ]);
  const qualifiedProspects = prospects.map((item) => ({ ...item, ...qualifyLinkProspect({ ...item, contacts: item.contacts as Array<{ type?: string; value?: string }> }) }));
  return {
    summary: {
      prospects: prospects.length,
      qualifiedProspects: qualifiedProspects.filter((item) => item.quality.eligible).length,
      strongProspects: qualifiedProspects.filter((item) => item.quality.state === "strong").length,
      awaitingApproval: drafts.filter((item) => item.status === "draft").length,
      sent: drafts.filter((item) => item.status === "sent").length,
    },
    prospects: qualifiedProspects,
    drafts,
  };
}
