import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";

const ActionSchema = z.object({ action: z.literal("approve") });

export async function PATCH(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  if (!z.string().uuid().safeParse(locationId).success || !ActionSchema.safeParse(await request.json().catch(() => null)).success) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "approve_spend")) return NextResponse.json({ error: "Spend-approval permission required." }, { status: 403 });
    return NextResponse.json({ location: { id: locationId, approval: "approved", active: true, synthetic: true } });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Local SEO requires DATABASE_URL." }, { status: 503 });
  const [existing] = await db().select({ siteSlug: schema.localSeoLocations.siteSlug }).from(schema.localSeoLocations).where(eq(schema.localSeoLocations.id, locationId)).limit(1);
  if (!existing || !await canAccessSite(request, existing.siteSlug)) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  if (!await hasPermission(request, "approve_spend", existing.siteSlug)) return NextResponse.json({ error: "Spend-approval permission required for this website." }, { status: 403 });
  const approvedBy = request.headers.get("x-orwell-user-email");
  const location = await db().transaction(async (tx) => {
    const [approved] = await tx.update(schema.localSeoLocations).set({ approval: "approved", active: true, approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.localSeoLocations.id, locationId), eq(schema.localSeoLocations.approval, "pending"))).returning();
    if (!approved) return null;
    await tx.update(schema.siteProfiles).set({
      approvedMonthlyUsd: sql`coalesce(${schema.siteProfiles.approvedMonthlyUsd}, 0) + ${approved.estimatedMonthlyUsd}`,
      updatedAt: new Date(),
    }).where(eq(schema.siteProfiles.slug, approved.siteSlug));
    return approved;
  });
  if (!location) return NextResponse.json({ error: "Location is already approved or does not exist." }, { status: 409 });
  return NextResponse.json({ location });
}
