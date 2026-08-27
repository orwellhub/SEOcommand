import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { hashInviteToken, hashPassword } from "@/lib/workspace-auth";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
const Schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(512) });

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Use an invitation link and a password of at least 12 characters." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ error: "Invitations are not available until the database is connected." }, { status: 503 });
  const secret = process.env.AUTH_SECRET; if (!secret || secret.length < 32) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const [user] = await db().select().from(schema.workspaceUsers).where(and(eq(schema.workspaceUsers.inviteTokenHash, hashInviteToken(parsed.data.token)), eq(schema.workspaceUsers.status, "invited"), gt(schema.workspaceUsers.inviteExpiresAt, new Date()))).limit(1);
  if (!user) return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 410 });
  const grants = await db().select().from(schema.userAccessGrants).where(eq(schema.userAccessGrants.userId, user.id)); const passwordHash = await hashPassword(parsed.data.password);
  await db().update(schema.workspaceUsers).set({ passwordHash, inviteTokenHash: null, inviteExpiresAt: null, status: "active", acceptedAt: new Date(), lastSignedInAt: new Date(), updatedAt: new Date() }).where(eq(schema.workspaceUsers.id, user.id));
  const token = await createSessionToken({ email: user.email, name: user.name, role: user.role, groupIds: grants.filter((grant) => grant.scopeType === "group" && grant.scopeId).map((grant) => grant.scopeId!), siteIds: grants.filter((grant) => grant.scopeType === "site" && grant.scopeId).map((grant) => grant.scopeId!), allAccess: grants.some((grant) => grant.scopeType === "portfolio"), grants: grants.map((grant) => ({ scopeType: grant.scopeType as "portfolio" | "group" | "site", scopeId: grant.scopeId, permissions: grant.permissions })) }, secret);
  const response = NextResponse.json({ ok: true }); response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS }); return response;
}
