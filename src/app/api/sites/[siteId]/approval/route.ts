import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canApproveBudget } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { canAccessSite } from "@/platform/access";

const Schema = z.object({ action: z.enum(["approve", "reject"]), approvedMonthlyUsd: z.number().positive().optional() });

export async function POST(
  request: Request,
  { params }: { params: { siteId: string } },
) {
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  if (!await canAccessSite(request, params.siteId) || !canApproveBudget(request.headers.get("x-orwell-user-role"))) {
    return NextResponse.json({ error: "Admin or Owner approval required." }, { status: 403 });
  }
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval decision." }, { status: 400 });

  const [current] = await db()
    .select()
    .from(schema.siteProfiles)
    .where(eq(schema.siteProfiles.slug, params.siteId))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const approved = parsed.data.action === "approve";
  const ceiling = parsed.data.approvedMonthlyUsd ?? current.forecastMonthlyUsd;
  if (approved && ceiling < current.forecastMonthlyUsd) {
    return NextResponse.json(
      { error: "The approved ceiling cannot be below the current forecast. Adjust the plan first." },
      { status: 400 },
    );
  }

  const result = await db().transaction(async (tx) => {
    const wasApproved = current.spendApproval === "approved";
    const [site] = await tx
      .update(schema.siteProfiles)
      .set({
        spendApproval: approved ? "approved" : "rejected",
        approvedMonthlyUsd: approved ? ceiling : null,
        approvedBy: request.headers.get("x-orwell-user-email"),
        approvedAt: new Date(),
        lifecycleStatus: approved
          ? wasApproved
            ? current.lifecycleStatus
            : "provisioning"
          : "active",
        updatedAt: new Date(),
      })
      .where(eq(schema.siteProfiles.slug, params.siteId))
      .returning();
    if (approved && !wasApproved) {
      await tx.insert(schema.platformJobs).values({
        siteSlug: params.siteId,
        kind: "initial_site_scan",
        progress: {
          stages: ["technical_crawl", "keyword_scan", "competitors", "backlinks", "ai_visibility"],
          completed: [],
        },
      });
    } else if (!approved) {
      await tx
        .update(schema.platformJobs)
        .set({ status: "cancelled", lastError: "Site spend approval was withdrawn." })
        .where(
          and(
            eq(schema.platformJobs.siteSlug, params.siteId),
            eq(schema.platformJobs.status, "queued"),
          ),
        );
    }
    return site;
  });
  return NextResponse.json({ site: result, initialScanQueued: approved && current.spendApproval !== "approved" });
}
