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
    if (!webhook) {
      skipped++;
      continue;
    }
    try {
      const url = new URL(webhook);
      if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
        throw new Error("Alert webhook must use HTTPS in production.");
      }
      const payload = JSON.stringify({
        event: `seo.alert.${item.notification.eventType}`,
        channel: item.delivery.channel,
        recipient: item.delivery.recipient,
        notification: item.notification,
      });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (process.env.ALERT_WEBHOOK_SECRET) {
        headers["x-orwell-signature"] = `sha256=${createHmac("sha256", process.env.ALERT_WEBHOOK_SECRET).update(payload).digest("hex")}`;
      }
      const response = await fetch(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
      await db().update(schema.notificationDeliveries).set({ status: "delivered", deliveredAt: new Date(), attempts: item.delivery.attempts + 1, lastError: null }).where(eq(schema.notificationDeliveries.id, item.delivery.id));
      delivered++;
    } catch (error) {
      await db().update(schema.notificationDeliveries).set({ status: item.delivery.attempts >= 4 ? "failed" : "queued", attempts: item.delivery.attempts + 1, lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }).where(eq(schema.notificationDeliveries.id, item.delivery.id));
      failed++;
    }
  }
  return { queued: queued.length, delivered, failed, skipped };
}
