import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { configuredUsers, sessionFromRequest } from "@/lib/auth";
import { createInviteToken } from "@/lib/workspace-auth";
import { hasDatabase } from "@/sync/store";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite, resolveGroupSiteSlugs } from "@/platform/site-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERMISSIONS = ["view", "research", "run_scans", "manage_content", "manage_connectors", "approve_spend", "manage_users", "manage_reports"] as const;
const InviteSchema = z.object({
  email: z.string().email().max(254), name: z.string().min(2).max(120), role: z.enum(["admin", "manager", "seo_analyst", "viewer"]),
  grants: z.array(z.object({ scopeType: z.enum(["portfolio", "group", "site"]), scopeId: z.string().max(120).nullable().optional(), permissions: z.array(z.enum(PERMISSIONS)).min(1) })).min(1).max(100),
});
const UpdateSchema = z.object({ id: z.string().uuid(), role: z.enum(["admin", "manager", "seo_analyst", "viewer"]).optional(), status: z.enum(["active", "suspended"]).optional(), grants: InviteSchema.shape.grants.optional() });
type QaUser = { id: string; email: string; name: string; role: string; status: string; grants: z.infer<typeof InviteSchema>["grants"]; invitedAt: string; lastSignedInAt: string | null };
const qaUsers: QaUser[] = [];

function permitted(request: Request) { return hasPermission(request, "manage_users"); }
async function grantError(request: Request, grants: z.infer<typeof InviteSchema>["grants"]): Promise<string | null> {
  for (const grant of grants) {
    if (grant.scopeType === "portfolio") {
      if (!(await Promise.all(grant.permissions.map((permission) => hasPermission(request, permission)))).every(Boolean)) return "You cannot delegate one or more selected portfolio permissions.";
      continue;
    }
    if (!grant.scopeId) return `Choose a ${grant.scopeType === "group" ? "folder" : "website"} for every scoped grant.`;
    const sites = grant.scopeType === "site"
      ? (await getManagedSite(grant.scopeId)) ? [grant.scopeId] : []
      : await resolveGroupSiteSlugs(grant.scopeId);
    if (!sites.length) return grant.scopeType === "site" ? "One or more selected websites do not exist." : "One or more selected folders are empty or do not exist.";
    for (const siteSlug of sites) {
      if (!await canAccessSite(request, siteSlug)) return "You cannot delegate access outside your own scope.";
      if (!(await Promise.all(grant.permissions.map((permission) => hasPermission(request, permission, siteSlug)))).every(Boolean)) return "You cannot delegate one or more selected permissions.";
    }
  }
  return null;
}
async function deliverInvite(payload: { email: string; name: string; inviteUrl: string; invitedBy: string | null }) {
  const url = process.env.USER_INVITE_WEBHOOK_URL || process.env.ALERT_EMAIL_WEBHOOK_URL;
  if (!url) return { delivered: false, reason: "Email delivery webhook is not configured." };
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "workspace_invite", ...payload }), signal: AbortSignal.timeout(15_000) });
    return response.ok ? { delivered: true } : { delivered: false, reason: `Email delivery returned ${response.status}.` };
  } catch (error) { return { delivered: false, reason: error instanceof Error ? error.message : "Email delivery failed." }; }
}

export async function GET(request: Request) {
  if (!await permitted(request)) return NextResponse.json({ error: "User-administration permission required." }, { status: 403 });
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (process.env.QA_SYNTHETIC === "true") {
    const configured = configuredUsers();
    const bootstrap = (configured.length ? configured : [{ email: session.email, name: session.name, role: session.role }]).map((user) => ({ id: `bootstrap:${user.email}`, email: user.email, name: user.name, role: user.role, status: "active", grants: [{ scopeType: "portfolio", scopeId: null, permissions: [...PERMISSIONS] }], invitedAt: null, lastSignedInAt: null, source: "bootstrap" }));
    return NextResponse.json({ ok: true, users: [...bootstrap, ...qaUsers], permissions: PERMISSIONS, synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ ok: true, users: configuredUsers().map((user) => ({ id: `bootstrap:${user.email}`, email: user.email, name: user.name, role: user.role, status: "active", grants: [], source: "bootstrap" })), permissions: PERMISSIONS });
  const [users, grants] = await Promise.all([db().select().from(schema.workspaceUsers), db().select().from(schema.userAccessGrants)]);
  return NextResponse.json({ ok: true, users: users.map((user) => ({ ...user, passwordHash: undefined, inviteTokenHash: undefined, grants: grants.filter((grant) => grant.userId === user.id) })), permissions: PERMISSIONS });
}

export async function POST(request: Request) {
  if (!await permitted(request)) return NextResponse.json({ error: "User-administration permission required." }, { status: 403 });
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = InviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid invitation." }, { status: 400 });
  const invalidGrant = await grantError(request, parsed.data.grants); if (invalidGrant) return NextResponse.json({ error: invalidGrant }, { status: 403 });
  if (session.role !== "admin" && parsed.data.role === "admin") return NextResponse.json({ error: "Only an Admin can invite another Admin." }, { status: 403 });
  const { token, hash } = createInviteToken(); const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000); const base = process.env.APP_BASE_URL || new URL(request.url).origin; const inviteUrl = `${base}/accept-invite?token=${encodeURIComponent(token)}`;
  if (process.env.QA_SYNTHETIC === "true") {
    const user: QaUser = { id: crypto.randomUUID(), email: parsed.data.email.toLowerCase(), name: parsed.data.name, role: parsed.data.role, status: "invited", grants: parsed.data.grants, invitedAt: new Date().toISOString(), lastSignedInAt: null }; qaUsers.push(user);
    return NextResponse.json({ ok: true, user, inviteUrl, delivery: { delivered: true, synthetic: true } }, { status: 201 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Database-backed invitations require DATABASE_URL." }, { status: 503 });
  const [existing] = await db().select().from(schema.workspaceUsers).where(eq(schema.workspaceUsers.email, parsed.data.email.toLowerCase())).limit(1);
  let userId: string;
  if (existing) {
    if (existing.status === "active") return NextResponse.json({ error: "That user already has an active account." }, { status: 409 });
    userId = existing.id; await db().update(schema.workspaceUsers).set({ name: parsed.data.name, role: parsed.data.role, status: "invited", inviteTokenHash: hash, inviteExpiresAt: expiresAt, invitedBy: session.email, invitedAt: new Date(), updatedAt: new Date() }).where(eq(schema.workspaceUsers.id, existing.id));
    await db().delete(schema.userAccessGrants).where(eq(schema.userAccessGrants.userId, existing.id));
  } else {
    const [user] = await db().insert(schema.workspaceUsers).values({ email: parsed.data.email.toLowerCase(), name: parsed.data.name, role: parsed.data.role, inviteTokenHash: hash, inviteExpiresAt: expiresAt, invitedBy: session.email }).returning({ id: schema.workspaceUsers.id }); userId = user!.id;
  }
  await db().insert(schema.userAccessGrants).values(parsed.data.grants.map((grant) => ({ userId, scopeType: grant.scopeType, scopeId: grant.scopeType === "portfolio" ? null : grant.scopeId ?? null, permissions: grant.permissions })));
  const delivery = await deliverInvite({ email: parsed.data.email, name: parsed.data.name, inviteUrl, invitedBy: session.email });
  return NextResponse.json({ ok: true, user: { id: userId, ...parsed.data, status: "invited" }, inviteUrl: delivery.delivered ? undefined : inviteUrl, delivery }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!await permitted(request)) return NextResponse.json({ error: "User-administration permission required." }, { status: 403 });
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid user update." }, { status: 400 });
  if (parsed.data.grants) { const invalidGrant = await grantError(request, parsed.data.grants); if (invalidGrant) return NextResponse.json({ error: invalidGrant }, { status: 403 }); }
  if (process.env.QA_SYNTHETIC === "true") { const user = qaUsers.find((item) => item.id === parsed.data.id); if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 }); Object.assign(user, parsed.data); return NextResponse.json({ ok: true, user, synthetic: true }); }
  if (!hasDatabase()) return NextResponse.json({ error: "Database-backed users require DATABASE_URL." }, { status: 503 });
  const [user] = await db().select().from(schema.workspaceUsers).where(eq(schema.workspaceUsers.id, parsed.data.id)).limit(1); if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (session.role !== "admin" && (user.role === "admin" || parsed.data.role === "admin")) return NextResponse.json({ error: "Only an Admin can change an Admin account." }, { status: 403 });
  await db().update(schema.workspaceUsers).set({ role: parsed.data.role ?? user.role, status: parsed.data.status ?? user.status, updatedAt: new Date() }).where(eq(schema.workspaceUsers.id, user.id));
  if (parsed.data.grants) { await db().delete(schema.userAccessGrants).where(eq(schema.userAccessGrants.userId, user.id)); await db().insert(schema.userAccessGrants).values(parsed.data.grants.map((grant) => ({ userId: user.id, scopeType: grant.scopeType, scopeId: grant.scopeType === "portfolio" ? null : grant.scopeId ?? null, permissions: grant.permissions }))); }
  return NextResponse.json({ ok: true });
}
