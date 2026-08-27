import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { nextReportRun } from "@/lib/report-schedule";
import { hasDatabase } from "@/sync/store";
import { getManagedSite, resolveGroupSiteSlugs } from "@/platform/site-store";
import { accessibleSiteSlugs, canAccessSite, hasPermission } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  templateId: z.string().min(1),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().email()).min(1).max(20),
  domainId: z.string().nullable().optional(),
  scopeType: z.enum(["portfolio", "group", "site", "campaign"]).default("portfolio"),
  scopeId: z.string().nullable().optional(),
  definition: z.record(z.string(), z.unknown()).optional(),
  format: z.enum(["PDF", "CSV", "PDF+CSV"]).default("PDF"),
});

function unavailable() {
  return NextResponse.json({ error: "Report persistence requires DATABASE_URL." }, { status: 503 });
}

async function campaignSiteSlug(campaignId: string | null): Promise<string | null> {
  if (!campaignId || !hasDatabase()) return null;
  const [campaign] = await db().select({ siteSlug: schema.rankTrackingCampaigns.siteSlug })
    .from(schema.rankTrackingCampaigns).where(eq(schema.rankTrackingCampaigns.id, campaignId)).limit(1);
  return campaign?.siteSlug ?? null;
}

async function manageScope(request: Request, scopeType: string, scopeId: string | null): Promise<boolean> {
  if (scopeType === "portfolio") return hasPermission(request, "manage_reports");
  if (scopeType === "site") return Boolean(scopeId && await canAccessSite(request, scopeId) && await hasPermission(request, "manage_reports", scopeId));
  if (scopeType === "group") {
    if (!scopeId) return false;
    const sites = await resolveGroupSiteSlugs(scopeId);
    return sites.length > 0 && (await Promise.all(sites.map(async (siteSlug) => await canAccessSite(request, siteSlug) && await hasPermission(request, "manage_reports", siteSlug)))).every(Boolean);
  }
  if (scopeType === "campaign") {
    const siteSlug = await campaignSiteSlug(scopeId);
    return Boolean(siteSlug && await canAccessSite(request, siteSlug) && await hasPermission(request, "manage_reports", siteSlug));
  }
  return false;
}

export async function GET(request: Request) {
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ schedules: [], synthetic: true });
  if (!hasDatabase()) return unavailable();
  const accessible = await accessibleSiteSlugs(request);
  const allSchedules = await db().select().from(schema.reportDeliverySchedules).orderBy(desc(schema.reportDeliverySchedules.createdAt));
  const allowed = accessible === null ? null : new Set(accessible);
  const schedules = allowed === null ? allSchedules : (await Promise.all(allSchedules.map(async (schedule) => {
    if (schedule.scopeType === "site") return schedule.scopeId && allowed.has(schedule.scopeId) ? schedule : null;
    if (schedule.scopeType === "group" && schedule.scopeId) {
      const sites = await resolveGroupSiteSlugs(schedule.scopeId);
      return sites.some((siteSlug) => allowed.has(siteSlug)) ? schedule : null;
    }
    if (schedule.scopeType === "campaign") {
      const siteSlug = await campaignSiteSlug(schedule.scopeId);
      return siteSlug && allowed.has(siteSlug) ? schedule : null;
    }
    return null;
  }))).filter((schedule): schedule is typeof allSchedules[number] => schedule !== null);
  return NextResponse.json({ schedules });
}

export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid template, cadence and recipient list." }, { status: 400 });
  const template = REPORT_TEMPLATES.find((candidate) => candidate.id === parsed.data.templateId);
  if (!template) return NextResponse.json({ error: "Unknown report template." }, { status: 404 });
  const scopeType = parsed.data.domainId ? "site" : parsed.data.scopeType;
  const scopeId = parsed.data.domainId ?? parsed.data.scopeId ?? null;
  if (scopeType === "site" && (!scopeId || !(await getManagedSite(scopeId)))) {
    return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
  }
  if (scopeType === "site" && scopeId && !await canAccessSite(request, scopeId)) {
    return NextResponse.json({ error: "Website access required." }, { status: 403 });
  }
  if (scopeType === "group" && scopeId && !(await resolveGroupSiteSlugs(scopeId)).length) return NextResponse.json({ error: "Unknown or empty folder." }, { status: 404 });
  if (scopeType === "campaign" && (!scopeId || (hasDatabase() && !(await campaignSiteSlug(scopeId))))) return NextResponse.json({ error: "Unknown tracking campaign." }, { status: 404 });
  if (!await manageScope(request, scopeType, scopeId)) return NextResponse.json({ error: "Report-management permission required for this scope." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    return NextResponse.json({
      schedule: {
        id: crypto.randomUUID(),
        domainSlug: scopeType === "site" ? scopeId : null,
        scopeType,
        scopeId,
        templateId: template.id,
        templateName: template.name,
        cadence: parsed.data.cadence,
        recipients: parsed.data.recipients,
        format: parsed.data.format,
        nextRun: nextReportRun(parsed.data.cadence),
        synthetic: true,
      },
    }, { status: 201 });
  }
  if (!hasDatabase()) return unavailable();

  const [schedule] = await db()
    .insert(schema.reportDeliverySchedules)
    .values({
      domainSlug: scopeType === "site" ? scopeId : null,
      scopeType,
      scopeId,
      templateId: template.id,
      templateName: template.name,
      cadence: parsed.data.cadence,
      recipients: parsed.data.recipients,
      channels: ["email"],
      definition: parsed.data.definition ?? {},
      format: parsed.data.format,
      nextRun: nextReportRun(parsed.data.cadence),
      createdBy: request.headers.get("x-orwell-user-email"),
    })
    .returning();
  return NextResponse.json({ schedule }, { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "A valid schedule id is required." }, { status: 400 });
  }
  if (process.env.QA_SYNTHETIC === "true") {
    if (!await hasPermission(request, "manage_reports")) return NextResponse.json({ error: "Report-management permission required." }, { status: 403 });
    return NextResponse.json({ ok: true, id, synthetic: true });
  }
  if (!hasDatabase()) return unavailable();
  const [schedule] = await db().select().from(schema.reportDeliverySchedules).where(eq(schema.reportDeliverySchedules.id, id)).limit(1);
  if (!schedule) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  if (!await manageScope(request, schedule.scopeType, schedule.scopeId)) return NextResponse.json({ error: "Report-management permission required for this scope." }, { status: 403 });
  const [deleted] = await db()
    .delete(schema.reportDeliverySchedules)
    .where(eq(schema.reportDeliverySchedules.id, id))
    .returning({ id: schema.reportDeliverySchedules.id });
  if (!deleted) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
