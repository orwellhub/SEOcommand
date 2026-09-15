import { reportDefinition, reportWidgetSites } from "@/reports/definition";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { sessionFromRequest } from "@/lib/auth";
import { canAccessSite, hasPermission } from "@/platform/access";
import { archiveReport, reportArchives, reportById, shareReport } from "@/reports/archive";
import { mailConfigured, sendMail } from "@/providers/google/mail";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, site = params.get("site") ?? "", id = params.get("id");
  if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ archives: [], mailConnected: false });
  if (!id) return NextResponse.json({ archives: await reportArchives(site), mailConnected: mailConfigured() });
  const row = z.string().uuid().safeParse(id).success ? await reportById(site, id) : null;
  if (!row) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  if (row.status !== "ready" || !row.payload.pdf) return NextResponse.json({ error: "PDF is queued for the browser worker. Check again after the next hourly run." }, { status: 409 });
  return new Response(Buffer.from(String(row.payload.pdf), "base64"), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="seo-report.pdf"', "cache-control": "private, no-store" } });
}
const inputSchema = z.object({ action: z.enum(["generate", "share", "revoke", "email", "retry"]), site: z.string().min(1).max(120), id: z.string().uuid().optional(), recipients: z.array(z.string().email()).min(1).max(10).optional(), templateId: z.string().optional(), definition: z.record(z.string(), z.unknown()).optional() });
export async function POST(request: Request) {
  const input = inputSchema.safeParse(await request.json().catch(() => null)), session = await sessionFromRequest(request);
  if (!input.success || !session) return NextResponse.json({ error: "Sign in and choose valid report details." }, { status: 400 });
  const body = input.data;
  if (!await canAccessSite(request, body.site) || !await hasPermission(request, "manage_reports", body.site)) return NextResponse.json({ error: "Report management access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ error: "Report delivery is disabled in preview." }, { status: 409 });
  try {
    if (body.action === "generate") {
      const definition = reportDefinition(body.templateId, body.definition);
      if (!(await Promise.all(reportWidgetSites(definition).map(async site => await canAccessSite(request, site) && await hasPermission(request, "manage_reports", site)))).every(Boolean)) return NextResponse.json({ error: "Report widget website access required." }, { status: 403 });
      const report = await archiveReport(body.site, session.email, body.templateId, body.definition); return NextResponse.json({ id: report.id, message: report.status === "ready" ? "PDF generated and archived." : "Report snapshot saved. PDF queued for the next hourly browser worker; client sharing is available now." }); }
    const report = body.id ? await reportById(body.site, body.id) : null;
    if (!report) throw new Error("Choose an archived report.");
    if (body.action === "retry") {
      await db().update(schema.commandRecords).set({ status: "queued", updatedAt: new Date() }).where(and(eq(schema.commandRecords.id, report.id), eq(schema.commandRecords.status, "failed")));
      return NextResponse.json({ message: "PDF queued from the original saved report." });
    }
    if (body.action === "share") { const share = await shareReport(body.site, report.id, session.email); return NextResponse.json({ url: `/api/reports/shared/${share.token}`, expiresAt: share.expiresAt, message: "Share link created. Anyone with this link can read this report for 30 days." }); }
    if (body.action === "revoke") { await db().update(schema.commandRecords).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(schema.commandRecords.siteSlug, body.site), eq(schema.commandRecords.kind, "workspace_share"), sql`${schema.commandRecords.payload}->>'reportId' = ${report.id}`)); return NextResponse.json({ message: "All share links for this report revoked." }); }
    if (report.status !== "ready" || !report.payload.pdf) throw new Error("Wait for the archived PDF to finish before emailing it.");
    if (!body.recipients?.length) throw new Error("Enter report recipients.");
    if (!mailConfigured()) throw new Error("Connect a Gmail mailbox before sending a report.");
    const deliveryKey = createHash("sha256").update(`${report.id}:${[...new Set(body.recipients.map((r) => r.toLowerCase()))].sort().join(",")}`).digest("hex");
    const [delivery] = await db().insert(schema.commandRecords).values({ siteSlug: body.site, kind: "workspace_report_delivery", recordKey: deliveryKey, status: "sending", createdBy: session.email, payload: { reportId: report.id, recipients: body.recipients } }).onConflictDoNothing().returning();
    if (!delivery) throw new Error("This report was already submitted to these recipients. Check Sent before trying again; generate a new report for a fresh delivery.");
    const sent = await sendMail({ id: delivery.id, to: body.recipients, subject: "Your SEO performance report", text: `Your saved SEO report for ${body.site} is attached. Generated ${report.createdAt.toISOString()}.`, attachment: Buffer.from(String(report.payload.pdf), "base64") });
    await db().update(schema.commandRecords).set({ status: "sent", updatedAt: new Date(), payload: { ...delivery.payload, messageId: sent.id, acceptedAt: new Date().toISOString() } }).where(eq(schema.commandRecords.id, delivery.id));
    return NextResponse.json({ message: "Report accepted by Gmail for delivery.", id: sent.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Report action failed." }, { status: 400 }); }
}
