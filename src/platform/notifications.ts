import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { Severity } from "@/lib/types";

export async function createNotification(input: {
  siteSlug?: string | null;
  eventType: string;
  severity: Severity;
  title: string;
  detail?: string;
  actionUrl?: string;
  fingerprint: string;
}) {
  if (!hasDatabase()) return null;
  const [item] = await db()
    .insert(schema.portfolioNotifications)
    .values({
      siteSlug: input.siteSlug ?? null,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      actionUrl: input.actionUrl,
      fingerprint: input.fingerprint,
    })
    .onConflictDoNothing({ target: schema.portfolioNotifications.fingerprint })
    .returning();
  if (!item) return null;

  const rules = await db()
    .select()
    .from(schema.notificationRules)
    .where(
      and(
        eq(schema.notificationRules.enabled, true),
        input.siteSlug
          ? sql`(${schema.notificationRules.siteSlug} = ${input.siteSlug} OR ${schema.notificationRules.siteSlug} IS NULL)`
          : isNull(schema.notificationRules.siteSlug),
      ),
    );
  const deliveries: (typeof schema.notificationDeliveries.$inferInsert)[] = [];
  for (const rule of rules) {
    if (rule.eventTypes.length && !rule.eventTypes.includes(input.eventType)) continue;
    for (const channel of rule.channels.filter((value) => value !== "in_app")) {
      const prefix = `${channel}:`;
      const addressed = rule.recipients
        .filter((recipient) => recipient.startsWith(prefix))
        .map((recipient) => recipient.slice(prefix.length));
      const recipients = addressed.length ? addressed : [null];
      for (const recipient of recipients) {
        deliveries.push({ notificationId: item.id, channel, recipient });
      }
    }
  }
  if (deliveries.length) await db().insert(schema.notificationDeliveries).values(deliveries);
  return item;
}

function siteVisibility(siteSlugs?: string[] | null) {
  if (siteSlugs === undefined || siteSlugs === null) return undefined;
  return siteSlugs.length
    ? or(isNull(schema.portfolioNotifications.siteSlug), inArray(schema.portfolioNotifications.siteSlug, siteSlugs))
    : isNull(schema.portfolioNotifications.siteSlug);
}

export async function notificationInbox(limit = 100, siteSlugs?: string[] | null) {
  if (!hasDatabase()) return [];
  const query = db().select().from(schema.portfolioNotifications);
  const visible = siteVisibility(siteSlugs);
  return (visible ? query.where(visible) : query)
    .orderBy(desc(schema.portfolioNotifications.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}

export async function unreadNotificationCount(siteSlugs?: string[] | null): Promise<number> {
  if (!hasDatabase()) return 0;
  const visible = siteVisibility(siteSlugs);
  const [row] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.portfolioNotifications)
    .where(and(
      isNull(schema.portfolioNotifications.readAt),
      eq(schema.portfolioNotifications.status, "open"),
      visible,
    ));
  return row?.count ?? 0;
}
