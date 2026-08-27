import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/accept-invite",
  "/api/auth/accept-invite",
  "/api/webhooks/whatsapp",
  "/api/healthz",
  "/api/sync",
]);

function encodeHeaderJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, process.env.AUTH_SECRET);

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/action-centre", request.url));
  }
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const isDedicatedQaService = process.env.RENDER_SERVICE_NAME === "orwell-qa-web";
  if (!session && isDedicatedQaService && process.env.QA_SYNTHETIC === "true" && process.env.QA_PUBLIC_ACCESS === "true") {
    const headers = new Headers(request.headers);
    headers.set("x-orwell-user-email", "qa@orwell.local");
    headers.set("x-orwell-user-name", "Staging QA");
    headers.set("x-orwell-user-role", "admin");
    headers.set("x-orwell-user-groups", "");
    headers.set("x-orwell-user-sites", "");
    headers.set("x-orwell-user-all-access", "true");
    headers.set("x-orwell-user-grants", "");
    return NextResponse.next({ request: { headers } });
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const headers = new Headers(request.headers);
  headers.set("x-orwell-user-email", session.email);
  headers.set("x-orwell-user-name", session.name);
  headers.set("x-orwell-user-role", session.role);
  headers.set("x-orwell-user-groups", session.groupIds.join(","));
  headers.set("x-orwell-user-sites", session.siteIds.join(","));
  headers.set("x-orwell-user-all-access", String(session.allAccess));
  headers.set("x-orwell-user-grants", encodeHeaderJson(session.grants));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
