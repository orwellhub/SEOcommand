import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { MCP_ACTOR } from "./config";

/**
 * In-process bridge from MCP tools to the existing API route handlers, so the
 * connector reuses each route's validation, access checks, synthetic-QA
 * behaviour and response logic instead of duplicating it.
 *
 * Route handlers authorise from the signed session cookie. The bridge signs a
 * short-lived session for an internal "claude-mcp" admin principal with
 * AUTH_SECRET; the cookie only ever exists inside this process and is never
 * returned to the MCP caller. Reaching this code already required the
 * SEOCOMMAND_MCP_TOKEN bearer check in /api/mcp.
 */

export const MCP_PRINCIPAL = {
  email: `${MCP_ACTOR}@seocommand.internal`,
  name: "Claude (MCP connector)",
  role: "admin" as const,
};

export class McpToolError extends Error {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "McpToolError";
  }
}

type Params = Record<string, string>;
type Handler<P extends Params> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response> | Response;

export interface RouteCall<P extends Params = Params> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  params?: P;
}

async function internalRequest(call: RouteCall<Params>): Promise<NextRequest> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new McpToolError("AUTH_SECRET is not configured on SEO Command, so the connector cannot use the app's routes.");
  const token = await createSessionToken(
    { ...MCP_PRINCIPAL, groupIds: [], siteIds: [], allAccess: true, grants: [] },
    secret,
  );
  const url = new URL(call.path, "http://seocommand.internal");
  for (const [key, value] of Object.entries(call.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    cookie: `${SESSION_COOKIE}=${token}`,
    // Attribution headers the proxy normally sets for signed-in users.
    "x-orwell-user-email": MCP_ACTOR,
    "x-orwell-user-name": MCP_PRINCIPAL.name,
    "x-orwell-user-role": MCP_PRINCIPAL.role,
  });
  if (call.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(url, {
    method: call.method ?? (call.body === undefined ? "GET" : "POST"),
    headers,
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
  });
}

export interface RouteResult<T> {
  status: number;
  ok: boolean;
  body: T;
}

/** Invoke a route handler in-process and parse its JSON response. */
export async function callRoute<T = Record<string, unknown>, P extends Params = Params>(handler: Handler<P>, call: RouteCall<P>): Promise<RouteResult<T>> {
  const request = await internalRequest(call);
  const response = await handler(request, { params: Promise.resolve((call.params ?? {}) as P) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text.slice(0, 500) };
  }
  return { status: response.status, ok: response.ok, body: body as T };
}

/** Like callRoute, but turns a non-2xx response into a tool error carrying
 * the route's own message. */
export async function callRouteOrThrow<T = Record<string, unknown>, P extends Params = Params>(handler: Handler<P>, call: RouteCall<P>): Promise<T> {
  const result = await callRoute<T, P>(handler, call);
  const body = result.body as Record<string, unknown> | null;
  if (!result.ok || (body && body.ok === false)) {
    const message = typeof body?.error === "string"
      ? body.error
      : typeof body?.message === "string"
        ? body.message
        : `The ${call.path} route returned HTTP ${result.status}.`;
    throw new McpToolError(message, { status: result.status, ...(body?.configured === false ? { configured: false } : {}) });
  }
  return result.body;
}
