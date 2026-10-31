import { createHash, timingSafeEqual } from "node:crypto";
import { MIN_TOKEN_LENGTH } from "./config";

/**
 * Bearer-token boundary for /api/mcp, independent of the session cookie used
 * by the dashboard (like /api/sync). The token is never logged or echoed.
 */

export type McpAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: Record<string, unknown>; headers: Record<string, string> };

const CHALLENGE = 'Bearer realm="seocommand-mcp"';

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison: both sides are hashed to equal-length digests
 * first, so neither content nor length leaks through timing. */
export function tokensMatch(supplied: string, expected: string): boolean {
  return timingSafeEqual(digest(supplied), digest(expected));
}

export function authorizeMcpRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): McpAuthResult {
  const expected = env.SEOCOMMAND_MCP_TOKEN ?? "";
  if (expected.trim().length < MIN_TOKEN_LENGTH) {
    return {
      ok: false,
      status: 503,
      body: { error: "The MCP endpoint is disabled: SEOCOMMAND_MCP_TOKEN is not configured (minimum 32 characters)." },
      headers: {},
    };
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized: send Authorization: Bearer <token>." },
      headers: { "WWW-Authenticate": CHALLENGE },
    };
  }
  if (!tokensMatch(match[1]!, expected.trim())) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized: the bearer token is not valid." },
      headers: { "WWW-Authenticate": `${CHALLENGE}, error="invalid_token"` },
    };
  }
  return { ok: true };
}
