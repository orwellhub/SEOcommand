import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateUser,
  configuredUsers,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

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
  if (!secret || secret.length < 32 || users.length === 0) {
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

  const user = authenticateUser(parsed.data.email, parsed.data.password, users);
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
