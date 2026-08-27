import { resolveGroupSiteSlugs } from "./site-store";
import { sessionFromRequest, type AccessGrantClaim } from "@/lib/auth";

export async function grantedGroupIds(request: Request): Promise<string[]> {
  return (await sessionFromRequest(request))?.groupIds ?? [];
}

export async function grantedSiteIds(request: Request): Promise<string[]> {
  return (await sessionFromRequest(request))?.siteIds ?? [];
}

export async function accessGrants(request: Request): Promise<AccessGrantClaim[]> {
  return (await sessionFromRequest(request))?.grants ?? [];
}

const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ["view", "research", "run_scans", "manage_content", "manage_connectors", "approve_spend", "manage_users", "manage_reports"],
  manager: ["view", "research", "run_scans", "manage_connectors", "approve_spend", "manage_users", "manage_reports"],
  seo_analyst: ["view", "research", "run_scans", "manage_content"],
  viewer: ["view"],
};

export async function hasPermission(request: Request, permission: string, siteSlug?: string | null): Promise<boolean> {
  const session = await sessionFromRequest(request);
  if (!session) return false;
  const role = session.role;
  const grants = session.grants;
  if (!grants.length) return (LEGACY_ROLE_PERMISSIONS[role] ?? []).includes(permission);
  for (const grant of grants) {
    if (!grant.permissions.includes(permission)) continue;
    if (grant.scopeType === "portfolio") return true;
    if (!siteSlug) continue;
    if (grant.scopeType === "site" && grant.scopeId === siteSlug) return true;
    if (grant.scopeType === "group" && grant.scopeId && (await resolveGroupSiteSlugs(grant.scopeId)).includes(siteSlug)) return true;
  }
  return false;
}

export async function canAccessSite(request: Request, siteSlug: string): Promise<boolean> {
  const session = await sessionFromRequest(request);
  if (!session) return false;
  const role = session.role;
  if (role === "admin" || role === "seo_analyst") return true;
  if (session.allAccess) return true;
  if (role !== "manager" && role !== "viewer") return false;
  const groupIds = session.groupIds;
  if (session.siteIds.includes(siteSlug)) return true;
  if (groupIds.length === 0) return false;
  const allowed = new Set((await Promise.all(groupIds.map(resolveGroupSiteSlugs))).flat());
  return allowed.has(siteSlug);
}

export async function accessibleSiteSlugs(request: Request): Promise<string[] | null> {
  const session = await sessionFromRequest(request);
  if (!session) return [];
  const role = session.role;
  if (role === "admin" || role === "seo_analyst") return null;
  if (session.allAccess) return null;
  if (role !== "manager" && role !== "viewer") return [];
  return [...new Set([...session.siteIds, ...(await Promise.all(session.groupIds.map(resolveGroupSiteSlugs))).flat()])];
}

/** Restrict a requested site set to the caller's portfolio grants. */
export async function filterAccessibleSiteSlugs(request: Request, siteSlugs: string[]): Promise<string[]> {
  const requested = [...new Set(siteSlugs)];
  const granted = await accessibleSiteSlugs(request);
  if (granted === null) return requested;
  const allowed = new Set(granted);
  return requested.filter((siteSlug) => allowed.has(siteSlug));
}
