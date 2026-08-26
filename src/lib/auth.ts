export const SESSION_COOKIE = "orwell_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type AppRole = "admin" | "manager" | "seo_analyst" | "viewer";

export interface AuthUser {
  email: string;
  password: string;
  name: string;
  role: AppRole;
  groupIds?: string[];
}

export interface SessionClaims {
  email: string;
  name: string;
  role: AppRole;
  groupIds: string[];
  issuedAt: number;
  expiresAt: number;
}

const ROLES = new Set<AppRole>(["admin", "manager", "seo_analyst", "viewer"]);
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
  );
}

export async function createSessionToken(
  user: Pick<AuthUser, "email" | "name" | "role" | "groupIds">,
  secret: string,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims: SessionClaims = {
    email: user.email.toLowerCase(),
    name: user.name,
    role: user.role,
    groupIds: "groupIds" in user && Array.isArray(user.groupIds) ? user.groupIds : [],
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE_SECONDS,
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
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

    const claims = JSON.parse(decoder.decode(fromBase64Url(payload))) as unknown;
    if (!isSessionClaims(claims)) return null;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (claims.expiresAt <= nowSeconds || claims.issuedAt > nowSeconds + 60) return null;
    return claims;
  } catch {
    return null;
  }
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
  return { email, password: candidate.password, name: candidate.name.trim() || email, role: candidate.role, groupIds };
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
      groupIds: [],
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
  return { email: user.email, name: user.name, role: user.role };
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
