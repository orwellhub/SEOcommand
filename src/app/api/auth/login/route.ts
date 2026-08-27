import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateUser,
  configuredUsers,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyPassword } from "@/lib/workspace-auth";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetsAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET;
  const users = configuredUsers();
  if (!secret || secret.length < 32 || (users.length === 0 && !hasDatabase())) {
    return NextResponse.json(
      { error: "Authentication is not configured. Set AUTH_SECRET and an internal user." },
      { status: 503 },
    );
  }

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const prior = attempts.get(client);
  if (prior && prior.resetsAt > now && prior.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429 });
  }

  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });

  let user = authenticateUser(parsed.data.email, parsed.data.password, users);
  if (!user && hasDatabase()) {
    try {
      const [account] = await db().select().from(schema.workspaceUsers).where(eq(schema.workspaceUsers.email, parsed.data.email.trim().toLowerCase())).limit(1);
      if (account?.status === "active" && account.passwordHash && await verifyPassword(parsed.data.password, account.passwordHash)) {
        const grants = await db().select().from(schema.userAccessGrants).where(eq(schema.userAccessGrants.userId, account.id));
        user = {
          email: account.email,
          name: account.name,
          role: account.role,
          groupIds: grants.filter((grant) => grant.scopeType === "group" && grant.scopeId).map((grant) => grant.scopeId!),
          siteIds: grants.filter((grant) => grant.scopeType === "site" && grant.scopeId).map((grant) => grant.scopeId!),
          allAccess: grants.some((grant) => grant.scopeType === "portfolio"),
          grants: grants.map((grant) => ({ scopeType: grant.scopeType as "portfolio" | "group" | "site", scopeId: grant.scopeId, permissions: grant.permissions })),
        };
        await db().update(schema.workspaceUsers).set({ lastSignedInAt: new Date(), updatedAt: new Date() }).where(eq(schema.workspaceUsers.id, account.id));
      }
    } catch {
      // During first deployment the auth migration may not have run yet; the
      // environment bootstrap account remains the safe fallback.
    }
  }
  if (!user) {
    const current = prior && prior.resetsAt > now ? prior : { count: 0, resetsAt: now + ATTEMPT_WINDOW_MS };
    attempts.set(client, { ...current, count: current.count + 1 });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  attempts.delete(client);

  const token = await createSessionToken(user, secret);
  const response = NextResponse.json({ ok: true, user });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
