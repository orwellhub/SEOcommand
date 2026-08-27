import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SettingsSchema = z.object({ displayName: z.string().max(120).nullable().optional(), phoneNumber: z.string().max(40).nullable().optional(), accountId: z.string().max(120).nullable().optional(), senderId: z.string().max(120).nullable().optional(), provider: z.enum(["meta_cloud", "webhook"]).default("meta_cloud") });
const TestSchema = z.object({ recipient: z.string().min(7).max(30), message: z.string().min(1).max(500).default("SEO Command Centre WhatsApp connection test successful.") });
let qaSettings: Record<string, unknown> = { provider: "meta_cloud", status: "not_configured", displayName: "Orwell alerts", phoneNumber: null, accountId: null, senderId: null };

function envState() { return { tokenConfigured: Boolean(process.env.META_WHATSAPP_TOKEN), senderConfigured: Boolean(process.env.META_WHATSAPP_PHONE_NUMBER_ID), webhookConfigured: Boolean(process.env.ALERT_WHATSAPP_WEBHOOK_URL), verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN) }; }

export async function GET(request: Request) {
  if (!await hasPermission(request, "manage_connectors")) return NextResponse.json({ error: "Portfolio connector permission required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, integration: qaSettings, environment: { tokenConfigured: true, senderConfigured: true, webhookConfigured: true, verifyTokenConfigured: true }, synthetic: true });
  let integration = null;
  if (hasDatabase()) [integration] = await db().select().from(schema.messagingIntegrations).where(eq(schema.messagingIntegrations.channel, "whatsapp")).limit(1);
  return NextResponse.json({ ok: true, integration, environment: envState(), setup: { callbackPath: "/api/webhooks/whatsapp", requiredSecrets: ["META_WHATSAPP_TOKEN", "META_WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"], fallbackSecret: "ALERT_WHATSAPP_WEBHOOK_URL" } });
}

export async function PATCH(request: Request) {
  if (!await hasPermission(request, "manage_connectors")) return NextResponse.json({ error: "Portfolio connector permission required." }, { status: 403 });
  const parsed = SettingsSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid WhatsApp settings." }, { status: 400 });
  const environment = envState(); const configured = parsed.data.provider === "webhook" ? environment.webhookConfigured : environment.tokenConfigured && environment.senderConfigured;
  if (process.env.QA_SYNTHETIC === "true") { qaSettings = { ...qaSettings, ...parsed.data, status: configured ? "connected" : "needs_secret" }; return NextResponse.json({ ok: true, integration: qaSettings, environment, synthetic: true }); }
  if (!hasDatabase()) return NextResponse.json({ error: "WhatsApp setup requires DATABASE_URL." }, { status: 503 });
  const values = { channel: "whatsapp", provider: parsed.data.provider, status: configured ? "connected" : "needs_secret", displayName: parsed.data.displayName, phoneNumber: parsed.data.phoneNumber, accountId: parsed.data.accountId, senderId: parsed.data.senderId, secretRef: parsed.data.provider === "webhook" ? "ALERT_WHATSAPP_WEBHOOK_URL" : "META_WHATSAPP_TOKEN", updatedBy: request.headers.get("x-orwell-user-email"), updatedAt: new Date() };
  const [integration] = await db().insert(schema.messagingIntegrations).values(values).onConflictDoUpdate({ target: schema.messagingIntegrations.channel, set: values }).returning();
  return NextResponse.json({ ok: true, integration, environment });
}

export async function POST(request: Request) {
  if (!await hasPermission(request, "manage_connectors")) return NextResponse.json({ error: "Portfolio connector permission required." }, { status: 403 });
  const parsed = TestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid recipient." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ ok: true, delivered: true, synthetic: true });
  const token = process.env.META_WHATSAPP_TOKEN; const senderId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  try {
    let response: Response;
    if (token && senderId) response = await fetch(`https://graph.facebook.com/${process.env.META_WHATSAPP_GRAPH_VERSION || "v23.0"}/${encodeURIComponent(senderId)}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: parsed.data.recipient.replace(/[^0-9]/g, ""), type: "text", text: { body: parsed.data.message } }), signal: AbortSignal.timeout(20_000) });
    else if (process.env.ALERT_WHATSAPP_WEBHOOK_URL) response = await fetch(process.env.ALERT_WHATSAPP_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "whatsapp", recipients: [parsed.data.recipient], message: parsed.data.message, test: true }), signal: AbortSignal.timeout(20_000) });
    else return NextResponse.json({ error: "Add the Meta Cloud API secrets or the webhook fallback before testing." }, { status: 409 });
    if (!response.ok) throw new Error(`Provider returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    if (hasDatabase()) await db().update(schema.messagingIntegrations).set({ lastTestAt: new Date(), lastTestStatus: "passed", lastError: null, status: "connected", updatedAt: new Date() }).where(eq(schema.messagingIntegrations.channel, "whatsapp"));
    return NextResponse.json({ ok: true, delivered: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp test failed.";
    if (hasDatabase()) await db().update(schema.messagingIntegrations).set({ lastTestAt: new Date(), lastTestStatus: "failed", lastError: message, updatedAt: new Date() }).where(eq(schema.messagingIntegrations.channel, "whatsapp"));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
