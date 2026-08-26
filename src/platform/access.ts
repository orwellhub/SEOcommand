import { resolveGroupSiteSlugs } from "./site-store";

export function grantedGroupIds(request: Request): string[] {
  return request.headers.get("x-orwell-user-groups")?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
}

export async function canAccessSite(request: Request, siteSlug: string): Promise<boolean> {
  const role = request.headers.get("x-orwell-user-role");
  if (role === "admin" || role === "seo_analyst") return true;
  if (role !== "manager" && role !== "viewer") return false;
  const groupIds = grantedGroupIds(request);
  if (groupIds.length === 0) return false;
  const allowed = new Set((await Promise.all(groupIds.map(resolveGroupSiteSlugs))).flat());
  return allowed.has(siteSlug);
}

export async function accessibleSiteSlugs(request: Request): Promise<string[] | null> {
  const role = request.headers.get("x-orwell-user-role");
  if (role === "admin" || role === "seo_analyst") return null;
  if (role !== "manager" && role !== "viewer") return [];
  const groupIds = grantedGroupIds(request);
  return [...new Set((await Promise.all(groupIds.map(resolveGroupSiteSlugs))).flat())];
}
