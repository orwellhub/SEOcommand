import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { configuredUsers } from "@/lib/auth";
import { googlePostBody, LocalPostSchema } from "@/lib/local-workflows";
import { businessConfigured, businessRequest } from "@/providers/google/business";
import { getManagedSite, resolveGroupSiteSlugs } from "./site-store";

async function ownerStillAllowed(email: string, site: string) {
  const [user] = await db().select().from(schema.workspaceUsers).where(eq(schema.workspaceUsers.email, email)).limit(1);
  const fallback = user ? null : configuredUsers().find(row => row.email === email);
  if (user && user.status !== "active" || !user && !fallback) return false;
  const role = user?.role ?? fallback?.role;
  const grants = user ? await db().select().from(schema.userAccessGrants).where(eq(schema.userAccessGrants.userId, user.id)) : fallback?.grants ?? [];
  if (!grants.length) return role === "admin" || role === "seo_analyst";
  for (const grant of grants) if (grant.permissions.includes("manage_content") && (grant.scopeType === "portfolio" || grant.scopeType === "site" && grant.scopeId === site || grant.scopeType === "group" && grant.scopeId && (await resolveGroupSiteSlugs(grant.scopeId)).includes(site))) return true;
  return false;
}
/** Only explicitly scheduled posts are sent. An uncertain submission is never retried automatically. */
export async function processLocalPosts(now = new Date(), stopped: () => boolean = () => false) {
  if (!hasDatabase() || !businessConfigured() || process.env.QA_SYNTHETIC === "true") return;
  const rows = await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.kind, "workspace_local_posts"), eq(schema.commandRecords.status, "scheduled"), sql`${schema.commandRecords.payload}->>'scheduledAt' <= ${now.toISOString()}`)).limit(20);
  for (const row of rows) {
    if (stopped()) break;
    const site = await getManagedSite(row.siteSlug);
    if (!site || ["archived", "paused"].includes(site.lifecycleStatus) || !await ownerStillAllowed(String(row.payload.scheduledBy ?? ""), row.siteSlug)) {
      await db().update(schema.commandRecords).set({ status: "paused", updatedAt: now, payload: { ...row.payload, error: "Publishing paused: check the website and scheduling owner's access." } }).where(and(eq(schema.commandRecords.id, row.id), eq(schema.commandRecords.status, "scheduled")));
      continue;
    }
    const input = LocalPostSchema.safeParse(row.payload);
    const [location] = input.success ? await db().select().from(schema.localSeoLocations).where(and(eq(schema.localSeoLocations.siteSlug, row.siteSlug), eq(schema.localSeoLocations.id, input.data.businessId))).limit(1) : [];
    const [connection] = location ? await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, row.siteSlug), eq(schema.commandRecords.kind, "workspace_business"), eq(schema.commandRecords.recordKey, location.id))).limit(1) : [];
    const account = String(connection?.payload.account ?? ""), googleLocation = String(connection?.payload.location ?? "");
    if (!input.success || !location?.placeId || (connection?.payload.profile as {metadata?:{placeId?:string}})?.metadata?.placeId !== location.placeId || !/^accounts\/\d+$/.test(account) || !/^locations\/\d+$/.test(googleLocation)) {
      await db().update(schema.commandRecords).set({ status: "paused", updatedAt: now, payload: { ...row.payload, error: "Relink the saved business to its matching Google profile before scheduling." } }).where(and(eq(schema.commandRecords.id, row.id), eq(schema.commandRecords.status, "scheduled")));
      continue;
    }
    const [claimed] = await db().update(schema.commandRecords).set({ status: "submitting", updatedAt: new Date() }).where(and(eq(schema.commandRecords.id, row.id), eq(schema.commandRecords.status, "scheduled"), eq(schema.commandRecords.updatedAt, row.updatedAt))).returning();
    if (!claimed) continue;
    try {
      const response = await businessRequest(`${account}/${googleLocation}/localPosts`, { method: "POST", body: googlePostBody(input.data) });
      await db().update(schema.commandRecords).set({ status: "submitted", updatedAt: new Date(), payload: { ...claimed.payload, googleName: response.name, googleState: response.state, submittedAt: new Date().toISOString() } }).where(eq(schema.commandRecords.id, row.id));
    } catch (error) {
      await db().update(schema.commandRecords).set({ status: "needs_review", updatedAt: new Date(), payload: { ...claimed.payload, error: `${error instanceof Error ? error.message : "Google did not confirm submission."} Check Google before creating another post; this submission will not be retried automatically.` } }).where(eq(schema.commandRecords.id, row.id));
    }
  }
  // A process interruption after sending is uncertain, never a safe retry.
  await db().update(schema.commandRecords).set({status:"needs_review",updatedAt:now,payload:sql`${schema.commandRecords.payload} || '{"error":"Submission was interrupted. Check Google before creating another post."}'::jsonb`}).where(and(eq(schema.commandRecords.kind,"workspace_local_posts"),inArray(schema.commandRecords.status,["submitting"]),sql`${schema.commandRecords.updatedAt} < ${new Date(now.getTime()-15*60000).toISOString()}::timestamptz`));
}
