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

const PatchSchema = z.object({ id: z.string().uuid(), read: z.boolean() });

export async function PATCH(request: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  if (!canWrite(request.headers.get("x-orwell-user-role"))) {
    return NextResponse.json({ error: "Write access required." }, { status: 403 });
  }
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification update." }, { status: 400 });
  const [item] = await db()
    .update(schema.portfolioNotifications)
    .set({ readAt: parsed.data.read ? new Date() : null })
    .where(eq(schema.portfolioNotifications.id, parsed.data.id))
    .returning();
  return item
    ? NextResponse.json({ item })
    : NextResponse.json({ error: "Notification not found." }, { status: 404 });
}
