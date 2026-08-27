import { createHmac } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export interface AlertDeliverySummary {
  queued: number;
  delivered: number;
  failed: number;
  skipped: number;
}

function webhookFor(channel: string): string | undefined {
  if (channel === "email") return process.env.ALERT_EMAIL_WEBHOOK_URL;
  if (channel === "whatsapp") return process.env.ALERT_WHATSAPP_WEBHOOK_URL;
  return undefined;
}

function metaWhatsAppConfigured() { return Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID); }

async function postMetaWhatsApp(recipient: string, notification: Record<string, unknown>) {
  const token = process.env.META_WHATSAPP_TOKEN!;
  const senderId = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "";
  const action = typeof notification.actionUrl === "string" && notification.actionUrl ? `${baseUrl}${notification.actionUrl}` : "";
  const message = [String(notification.title ?? "SEO Command Centre alert"), notification.detail ? String(notification.detail) : "", action].filter(Boolean).join("\n\n").slice(0, 3_800);
  const response = await fetch(`https://graph.facebook.com/${process.env.META_WHATSAPP_GRAPH_VERSION || "v23.0"}/${encodeURIComponent(senderId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: recipient.replace(/^whatsapp:/, "").replace(/[^0-9]/g, ""), type: "text", text: { body: message } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Meta WhatsApp returned HTTP ${response.status}: ${(await response.text()).slice(0, 250)}`);
}

export interface AlertWebhookRequest {
  url: URL;
  headers: Record<string, string>;
  body: string;
}

export function buildAlertWebhookRequest(input: {
  webhook: string;
  secret?: string;
  production?: boolean;
  eventType: string;
  channel: string;
  recipient: string | null;
  notification: Record<string, unknown>;
}): AlertWebhookRequest {
  const url = new URL(input.webhook);
  if (input.production && url.protocol !== "https:") {
    throw new Error("Alert webhook must use HTTPS in production.");
  }
  const body = JSON.stringify({
    event: `seo.alert.${input.eventType}`,
    channel: input.channel,
    recipient: input.recipient,
    notification: input.notification,
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.secret) {
    headers["x-orwell-signature"] = `sha256=${createHmac("sha256", input.secret).update(body).digest("hex")}`;
  }
  return { url, headers, body };
}

export async function postAlertWebhook(
  request: AlertWebhookRequest,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
}

/** Deliver queued email/WhatsApp alerts through operator-owned signed webhooks. */
export async function deliverQueuedAlerts(limit = 200): Promise<AlertDeliverySummary> {
  const queued = await db()
    .select({ delivery: schema.notificationDeliveries, notification: schema.portfolioNotifications })
    .from(schema.notificationDeliveries)
    .innerJoin(
      schema.portfolioNotifications,
      eq(schema.notificationDeliveries.notificationId, schema.portfolioNotifications.id),
    )
    .where(eq(schema.notificationDeliveries.status, "queued"))
    .orderBy(asc(schema.notificationDeliveries.createdAt))
    .limit(limit);
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  for (const item of queued) {
    const webhook = webhookFor(item.delivery.channel);
    const directWhatsApp = item.delivery.channel === "whatsapp" && metaWhatsAppConfigured() && Boolean(item.delivery.recipient);
    if (!webhook && !directWhatsApp) {
      skipped++;
      continue;
    }
    try {
      if (directWhatsApp) await postMetaWhatsApp(item.delivery.recipient!, item.notification as unknown as Record<string, unknown>);
      else {
        const request = buildAlertWebhookRequest({
          webhook: webhook!, secret: process.env.ALERT_WEBHOOK_SECRET,
          production: process.env.NODE_ENV === "production", eventType: item.notification.eventType,
          channel: item.delivery.channel, recipient: item.delivery.recipient,
          notification: item.notification as unknown as Record<string, unknown>,
        });
        await postAlertWebhook(request);
      }
      await db().update(schema.notificationDeliveries).set({ status: "delivered", deliveredAt: new Date(), attempts: item.delivery.attempts + 1, lastError: null }).where(eq(schema.notificationDeliveries.id, item.delivery.id));
      delivered++;
    } catch (error) {
      await db().update(schema.notificationDeliveries).set({ status: item.delivery.attempts >= 4 ? "failed" : "queued", attempts: item.delivery.attempts + 1, lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }).where(eq(schema.notificationDeliveries.id, item.delivery.id));
      failed++;
    }
  }
  return { queued: queued.length, delivered, failed, skipped };
}
