import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessSite, accessibleSiteSlugs } from "@/platform/access";
import { sessionFromRequest } from "@/lib/auth";
import { buildReportHtml, reportScopeSites } from "@/reports/build";
import { reportDefinition } from "@/reports/definition";
import { reportDocumentCsv } from "@/reports/csv";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await sessionFromRequest(request)) return NextResponse.json({ error: "Sign in to view reports." }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const parsed = z.enum(["site", "portfolio", "group", "campaign"]).safeParse(p.get("scopeType") ?? "site");
  if (!parsed.success) return NextResponse.json({ error: "Choose a report scope." }, { status: 400 });
  try {
    const definition = reportDefinition(p.get("template") ?? "tpl-domain", { days: Number(p.get("days") ?? 28), sections: p.getAll("section"), widgets: p.has("widgets") ? JSON.parse(p.get("widgets")!) : undefined });
    const scope = { scopeType: parsed.data, scopeId: p.get("scopeId") ?? p.get("site"), templateId: definition.templateId, definition };
    const sites = await reportScopeSites(scope), allowed = await accessibleSiteSlugs(request);
    if (scope.scopeType !== "portfolio" && (!sites.length || !(await Promise.all(sites.map(s => canAccessSite(request, s)))).every(Boolean))) return NextResponse.json({ error: "Report scope access required." }, { status: 403 });
    const html = await buildReportHtml(scope, allowed ?? undefined);
    if (p.get("format") === "csv") return new Response(reportDocumentCsv(html), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="seo-report.csv"', "cache-control": "private, no-store" } });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Report unavailable." }, { status: 400 }); }
}
