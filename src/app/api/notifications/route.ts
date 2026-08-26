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
