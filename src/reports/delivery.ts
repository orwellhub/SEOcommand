import { createHmac } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextReportRun, type ReportCadence } from "@/lib/report-schedule";
import { buildDomainBundle, buildPortfolio } from "@/sync/bundle";

export interface DeliverySummary {
  due: number;
  delivered: number;
  failed: number;
  skipped: number;
}

/**
 * Deliver due reports to an operator-owned webhook (Make, n8n, Zapier, etc.).
 * The webhook receives canonical live data plus recipients and can render/send
 * through the portfolio's chosen email provider. No third-party mail vendor is
 * hard-coded into the platform.
 */
export async function deliverDueReports(now = new Date()): Promise<DeliverySummary> {
  const due = await db()
    .select()
    .from(schema.reportDeliverySchedules)
    .where(
      and(
        eq(schema.reportDeliverySchedules.enabled, true),
        lte(schema.reportDeliverySchedules.nextRun, now),
      ),
    );

  const webhook = process.env.REPORT_DELIVERY_WEBHOOK_URL;
  if (!webhook) return { due: due.length, delivered: 0, failed: 0, skipped: due.length };
  const url = new URL(webhook);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("REPORT_DELIVERY_WEBHOOK_URL must use HTTPS in production.");
  }

  let delivered = 0;
  let failed = 0;
  const portfolio = due.some((schedule) => !schedule.domainSlug) ? await buildPortfolio() : null;

  for (const schedule of due) {
    try {
      const data = schedule.domainSlug
        ? await buildDomainBundle(schedule.domainSlug)
        : portfolio;
      const payload = JSON.stringify({
        event: "seo.report.due",
        schedule: {
          id: schedule.id,
          templateId: schedule.templateId,
          templateName: schedule.templateName,
          cadence: schedule.cadence,
          domainId: schedule.domainSlug,
          recipients: schedule.recipients,
          format: schedule.format,
        },
        generatedAt: now.toISOString(),
        data,
      });
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (process.env.REPORT_WEBHOOK_SECRET) {
        headers["x-orwell-signature"] = `sha256=${createHmac("sha256", process.env.REPORT_WEBHOOK_SECRET)
          .update(payload)
          .digest("hex")}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);

      await db()
        .update(schema.reportDeliverySchedules)
        .set({
          lastDelivered: now,
          lastError: null,
          nextRun: nextReportRun(schedule.cadence as ReportCadence, now),
          updatedAt: now,
        })
        .where(eq(schema.reportDeliverySchedules.id, schedule.id));
      delivered++;
    } catch (error) {
      failed++;
      await db()
        .update(schema.reportDeliverySchedules)
        .set({
          lastError: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          updatedAt: now,
        })
        .where(eq(schema.reportDeliverySchedules.id, schedule.id));
    }
  }

  return { due: due.length, delivered, failed, skipped: 0 };
}
