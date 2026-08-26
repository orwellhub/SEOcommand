import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { notificationInbox, unreadNotificationCount } from "@/platform/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit")) || 100;
  if (process.env.QA_SYNTHETIC === "true") {
    const items = Array.from({ length: 20 }, (_, index) => ({
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      siteSlug: index === 0 ? "mortgagecompare" : `qa-site-${String(index + 1).padStart(2, "0")}`,
      eventType: index % 4 === 0 ? "technical_regression" : "rank_drop",
      severity: index % 4 === 0 ? "critical" : index % 3 === 0 ? "high" : "medium",
      title: index % 4 === 0 ? "Technical health needs attention" : "Tracked rankings moved",
      detail: "Synthetic staging notification used for workflow and responsive QA.",
      actionUrl: index === 0 ? "/sites/mortgagecompare" : `/sites/qa-site-${String(index + 1).padStart(2, "0")}`,
      fingerprint: `qa-notice-${index}`, status: index > 16 ? "resolved" : index > 13 ? "snoozed" : "open",
      readAt: index % 2 ? new Date("2026-08-26T08:00:00Z") : null,
      snoozedUntil: index > 13 && index <= 16 ? new Date("2026-08-27T08:00:00Z") : null,
      resolvedAt: index > 16 ? new Date("2026-08-26T09:00:00Z") : null, resolvedBy: index > 16 ? "qa@orwell.local" : null,
      createdAt: new Date(Date.UTC(2026, 7, 26, 8, index)),
    }));
    return NextResponse.json({ items: items.slice(0, limit), unread: items.filter((item) => !item.readAt && item.status === "open").length });
  }
  const [items, unread] = await Promise.all([notificationInbox(limit), unreadNotificationCount()]);
  return NextResponse.json({ items, unread });
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["read", "unread", "resolve", "dismiss", "snooze", "reopen"]).optional(),
  read: z.boolean().optional(),
  snoozedUntil: z.string().datetime().optional(),
});

export async function PATCH(request: Request) {
  if (process.env.QA_SYNTHETIC === "true") {
    const body = await request.json().catch(() => ({})) as { id?: string; action?: string };
    return NextResponse.json({ item: { id: body.id, status: body.action ?? "read", synthetic: true } });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  if (!canWrite(request.headers.get("x-orwell-user-role"))) {
    return NextResponse.json({ error: "Write access required." }, { status: 403 });
  }
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification update." }, { status: 400 });
  const action = parsed.data.action ?? (parsed.data.read === false ? "unread" : "read");
  const now = new Date();
  const values =
    action === "resolve"
      ? { status: "resolved", resolvedAt: now, resolvedBy: request.headers.get("x-orwell-user-email"), readAt: now, snoozedUntil: null }
      : action === "dismiss"
        ? { status: "dismissed", readAt: now, snoozedUntil: null }
        : action === "snooze"
          ? { status: "snoozed", snoozedUntil: parsed.data.snoozedUntil ? new Date(parsed.data.snoozedUntil) : new Date(now.getTime() + 24 * 60 * 60 * 1000), readAt: now }
          : action === "reopen"
            ? { status: "open", resolvedAt: null, resolvedBy: null, snoozedUntil: null }
            : { readAt: action === "read" ? now : null };
  const [item] = await db()
    .update(schema.portfolioNotifications)
    .set(values)
    .where(eq(schema.portfolioNotifications.id, parsed.data.id))
    .returning();
  if (item) {
    await db().insert(schema.accessAuditEvents).values({
      siteSlug: item.siteSlug,
      actorEmail: request.headers.get("x-orwell-user-email"),
      actorRole: request.headers.get("x-orwell-user-role"),
      action,
      area: "notification",
      summary: `${action[0]?.toUpperCase()}${action.slice(1)} notification: ${item.title}`,
      metadata: { notificationId: item.id },
    });
  }
  return item
    ? NextResponse.json({ item })
    : NextResponse.json({ error: "Notification not found." }, { status: 404 });
}
