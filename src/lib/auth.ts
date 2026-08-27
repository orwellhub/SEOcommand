export const SESSION_COOKIE = "orwell_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type AppRole = "admin" | "manager" | "seo_analyst" | "viewer";

export interface AuthUser {
  email: string;
  password: string;
  name: string;
  role: AppRole;
  groupIds?: string[];
  siteIds?: string[];
  allAccess?: boolean;
  grants?: AccessGrantClaim[];
}

export interface AccessGrantClaim { scopeType: "portfolio" | "group" | "site"; scopeId: string | null; permissions: string[]; }

export interface SessionClaims {
  email: string;
  name: string;
  role: AppRole;
  groupIds: string[];
  siteIds: string[];
  allAccess: boolean;
  grants: AccessGrantClaim[];
  issuedAt: number;
  expiresAt: number;
}

const ROLES = new Set<AppRole>(["admin", "manager", "seo_analyst", "viewer"]);
const SESSION_PERMISSIONS = ["view", "research", "run_scans", "manage_content", "manage_connectors", "approve_spend", "manage_users", "manage_reports"] as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && ROLES.has(value as AppRole);
}

function packGrant(grant: AccessGrantClaim): ["p" | "g" | "s", string | null, number] {
  const scope = grant.scopeType === "portfolio" ? "p" : grant.scopeType === "group" ? "g" : "s";
  const mask = SESSION_PERMISSIONS.reduce((value, permission, index) => grant.permissions.includes(permission) ? value | (1 << index) : value, 0);
  return [scope, grant.scopeId, mask];
}

function unpackGrants(value: unknown): AccessGrantClaim[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((grant): AccessGrantClaim[] => {
    if (Array.isArray(grant) && (grant[0] === "p" || grant[0] === "g" || grant[0] === "s") && (grant[1] === null || typeof grant[1] === "string") && typeof grant[2] === "number") {
      return [{
        scopeType: grant[0] === "p" ? "portfolio" : grant[0] === "g" ? "group" : "site",
        scopeId: grant[1],
        permissions: SESSION_PERMISSIONS.filter((_, index) => (grant[2] & (1 << index)) !== 0),
      }];
    }
    if (grant && typeof grant === "object") {
      const candidate = grant as Partial<AccessGrantClaim>;
      if (["portfolio", "group", "site"].includes(candidate.scopeType ?? "") && (candidate.scopeId === null || typeof candidate.scopeId === "string") && Array.isArray(candidate.permissions)) {
        return [{ scopeType: candidate.scopeType as AccessGrantClaim["scopeType"], scopeId: candidate.scopeId ?? null, permissions: candidate.permissions.filter((permission): permission is string => typeof permission === "string") }];
      }
    }
    return [];
  });
}

function isSessionClaims(value: unknown): value is SessionClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Partial<SessionClaims>;
  return (
    typeof claims.email === "string" &&
    typeof claims.name === "string" &&
    isRole(claims.role) &&
    typeof claims.issuedAt === "number" &&
    typeof claims.expiresAt === "number"
    && Array.isArray(claims.groupIds)
    && (claims.siteIds === undefined || Array.isArray(claims.siteIds))
    && (claims.grants === undefined || Array.isArray(claims.grants))
  );
}

export async function createSessionToken(
  user: Pick<AuthUser, "email" | "name" | "role" | "groupIds" | "siteIds" | "allAccess" | "grants">,
  secret: string,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims: SessionClaims = {
    email: user.email.toLowerCase(),
    name: user.name,
    role: user.role,
    groupIds: "groupIds" in user && Array.isArray(user.groupIds) ? user.groupIds : [],
    siteIds: "siteIds" in user && Array.isArray(user.siteIds) ? user.siteIds : [],
    allAccess: user.allAccess === true,
    grants: Array.isArray(user.grants) ? user.grants : [],
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS,
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify({ ...claims, grants: claims.grants.map(packGrant) })));
  const signature = toBase64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = new Date(),
): Promise<SessionClaims | null> {
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  try {
    const expected = await hmac(payload, secret);
    const supplied = fromBase64Url(signature);
    if (expected.length !== supplied.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ supplied[i];
    if (mismatch !== 0) return null;

    const raw = JSON.parse(decoder.decode(fromBase64Url(payload))) as Record<string, unknown>;
    const claims = { ...raw, grants: unpackGrants(raw.grants) } as unknown;
    if (!isSessionClaims(claims)) return null;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (claims.expiresAt <= nowSeconds || claims.issuedAt > nowSeconds + 60) return null;
    return { ...claims, siteIds: claims.siteIds ?? [], allAccess: claims.allAccess === true, grants: claims.grants ?? [] };
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return undefined; }
  }
  return undefined;
}

/** Resolve authorization claims from the signed cookie, never caller headers. */
export function sessionFromRequest(request: Request): Promise<SessionClaims | null> {
  return verifySessionToken(cookieValue(request, SESSION_COOKIE), process.env.AUTH_SECRET);
}

function normaliseUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AuthUser>;
  if (
    typeof candidate.email !== "string" ||
    typeof candidate.password !== "string" ||
    typeof candidate.name !== "string" ||
    !isRole(candidate.role)
  ) {
    return null;
  }
  const email = candidate.email.trim().toLowerCase();
  if (!email || !candidate.password) return null;
  const groupIds = Array.isArray(candidate.groupIds)
    ? candidate.groupIds.filter((id): id is string => typeof id === "string")
    : [];
  const siteIds = Array.isArray(candidate.siteIds)
    ? candidate.siteIds.filter((id): id is string => typeof id === "string")
    : [];
  const grants = Array.isArray(candidate.grants)
    ? candidate.grants.filter((grant): grant is AccessGrantClaim => Boolean(
      grant
      && ["portfolio", "group", "site"].includes(grant.scopeType)
      && Array.isArray(grant.permissions)
      && grant.permissions.every((permission) => typeof permission === "string"),
    ))
    : [];
  return { email, password: candidate.password, name: candidate.name.trim() || email, role: candidate.role, groupIds, siteIds, allAccess: candidate.allAccess === true, grants };
}

export function configuredUsers(env: Record<string, string | undefined> = process.env): AuthUser[] {
  if (env.AUTH_USERS_JSON) {
    try {
      const parsed = JSON.parse(env.AUTH_USERS_JSON) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normaliseUser).filter((user): user is AuthUser => user !== null);
    } catch {
      return [];
    }
  }

  if (!env.AUTH_EMAIL || !env.AUTH_PASSWORD) return [];
  return [
    {
      email: env.AUTH_EMAIL.trim().toLowerCase(),
      password: env.AUTH_PASSWORD,
      name: env.AUTH_NAME?.trim() || "Orwell Admin",
      role: isRole(env.AUTH_ROLE) ? env.AUTH_ROLE : "admin",
      groupIds: [], siteIds: [], allAccess: true, grants: [],
    },
  ];
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let i = 0; i < length; i++) mismatch |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  return mismatch === 0;
}

export function authenticateUser(
  email: string,
  password: string,
  users: AuthUser[] = configuredUsers(),
): Omit<AuthUser, "password"> | null {
  const normalisedEmail = email.trim().toLowerCase();
  const user = users.find((candidate) => safeStringEqual(candidate.email, normalisedEmail));
  if (!user || !safeStringEqual(user.password, password)) return null;
  return { email: user.email, name: user.name, role: user.role, groupIds: [...(user.groupIds ?? [])], siteIds: [...(user.siteIds ?? [])], allAccess: user.allAccess === true, grants: [...(user.grants ?? [])] };
}

export function canWrite(role: AppRole | string | null): boolean {
  return role === "admin" || role === "seo_analyst";
}

/** Owners are intentionally read-only except for spend approval. */
export function canApproveBudget(role: AppRole | string | null): boolean {
  return role === "admin" || role === "manager";
}

export function roleLabel(role: AppRole | string | null): string {
  if (role === "manager") return "Owner";
  if (role === "seo_analyst") return "SEO operator";
  if (role === "admin") return "Admin";
  return "Viewer";
}
