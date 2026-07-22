import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isDomainId } from "@/data/domains";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { canWrite } from "@/lib/auth";
import { nextReportRun } from "@/lib/report-schedule";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  templateId: z.string().min(1),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().email()).min(1).max(20),
  domainId: z.string().nullable().optional(),
  format: z.enum(["PDF", "CSV", "PDF+CSV"]).default("PDF"),
});

function unavailable() {
  return NextResponse.json({ error: "Report persistence requires DATABASE_URL." }, { status: 503 });
}

function canMutate(request: Request): boolean {
  return canWrite(request.headers.get("x-orwell-user-role"));
}

export async function GET() {
  if (!hasDatabase()) return unavailable();
  const schedules = await db()
    .select()
    .from(schema.reportDeliverySchedules)
    .orderBy(desc(schema.reportDeliverySchedules.createdAt));
  return NextResponse.json({ schedules });
}

export async function POST(request: Request) {
  if (!hasDatabase()) return unavailable();
  if (!canMutate(request)) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid template, cadence and recipient list." }, { status: 400 });
  const template = REPORT_TEMPLATES.find((candidate) => candidate.id === parsed.data.templateId);
  if (!template) return NextResponse.json({ error: "Unknown report template." }, { status: 404 });
  if (parsed.data.domainId && !isDomainId(parsed.data.domainId)) {
    return NextResponse.json({ error: "Unknown domain." }, { status: 404 });
  }

  const [schedule] = await db()
    .insert(schema.reportDeliverySchedules)
    .values({
      domainSlug: parsed.data.domainId ?? null,
      templateId: template.id,
      templateName: template.name,
      cadence: parsed.data.cadence,
      recipients: parsed.data.recipients,
      format: parsed.data.format,
      nextRun: nextReportRun(parsed.data.cadence),
      createdBy: request.headers.get("x-orwell-user-email"),
    })
    .returning();
  return NextResponse.json({ schedule }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!hasDatabase()) return unavailable();
  if (!canMutate(request)) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "A valid schedule id is required." }, { status: 400 });
  }
  const [deleted] = await db()
    .delete(schema.reportDeliverySchedules)
    .where(eq(schema.reportDeliverySchedules.id, id))
    .returning({ id: schema.reportDeliverySchedules.id });
  if (!deleted) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
