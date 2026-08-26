import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";

export const runtime = "nodejs";

const ActionSchema = z.object({ action: z.literal("approve") });

export async function PATCH(request: Request, { params }: { params: { locationId: string } }) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!z.string().uuid().safeParse(params.locationId).success || !ActionSchema.safeParse(await request.json().catch(() => null)).success) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  const approvedBy = request.headers.get("x-orwell-user-email");
  const location = await db().transaction(async (tx) => {
    const [approved] = await tx.update(schema.localSeoLocations).set({ approval: "approved", active: true, approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.localSeoLocations.id, params.locationId), eq(schema.localSeoLocations.approval, "pending"))).returning();
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
