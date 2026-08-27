import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";

const Schema = z.object({ action: z.enum(["approve", "reject"]), approvedMonthlyUsd: z.number().positive().optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  if (!(await getManagedSite(siteId))) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  if (!await canAccessSite(request, siteId) || !await hasPermission(request, "approve_spend", siteId)) return NextResponse.json({ error: "Spend-approval permission required for this website." }, { status: 403 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval decision." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    const approved = parsed.data.action === "approve";
    return NextResponse.json({
      site: {
        slug: siteId,
        lifecycleStatus: "active",
        spendApproval: approved ? "approved" : "rejected",
        approvedMonthlyUsd: approved ? parsed.data.approvedMonthlyUsd ?? null : null,
        synthetic: true,
      },
      initialScanQueued: approved,
    });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });

  const [current] = await db()
    .select()
    .from(schema.siteProfiles)
    .where(eq(schema.siteProfiles.slug, siteId))
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
      .where(eq(schema.siteProfiles.slug, siteId))
      .returning();
    if (approved && !wasApproved) {
      await tx.insert(schema.platformJobs).values({
        siteSlug: siteId,
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
            eq(schema.platformJobs.siteSlug, siteId),
            eq(schema.platformJobs.status, "queued"),
          ),
        );
    }
    return site;
  });
  return NextResponse.json({ site: result, initialScanQueued: approved && current.spendApproval !== "approved" });
}
