import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { hasDatabase } from "@/sync/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Widget = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["metric", "table", "chart", "outcomes"]),
  title: z.string().trim().min(2).max(120),
  metric: z.enum([
    "share_of_voice",
    "newcomers",
    "publishing_velocity",
    "link_opportunities",
    "coverage_gaps",
    "ai_share_of_voice",
    "verified_value",
    "forecast",
  ]),
  size: z.enum(["small", "medium", "large"]),
});
const Save = z.object({
  siteSlug: z.string().min(1).max(120),
  name: z.string().trim().min(2).max(120),
  widgets: z.array(Widget).min(1).max(20),
});
const Remove = z.object({
  id: z.string().uuid(),
  siteSlug: z.string().min(1).max(120),
});
export async function POST(request: Request) {
  const parsed = Save.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a name and at least one dashboard widget." },
      { status: 400 },
    );
  if (
    !(await canAccessSite(request, parsed.data.siteSlug)) ||
    !(await hasPermission(request, "research", parsed.data.siteSlug))
  )
    return NextResponse.json(
      { error: "Research permission required for this website." },
      { status: 403 },
    );
  if (process.env.QA_SYNTHETIC === "true")
    return NextResponse.json(
      {
        dashboard: {
          id: "78000000-0000-4000-8000-000000000001",
          name: parsed.data.name,
          scopeType: "site",
          scopeId: parsed.data.siteSlug,
          widgets: parsed.data.widgets,
          updatedAt: new Date().toISOString(),
        },
        synthetic: true,
      },
      { status: 201 },
    );
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Saved dashboards require DATABASE_URL." },
      { status: 503 },
    );
  const [dashboard] = await db()
    .insert(schema.customDashboards)
    .values({
      name: parsed.data.name,
      scopeType: "site",
      scopeId: parsed.data.siteSlug,
      widgets: parsed.data.widgets,
      createdBy: request.headers.get("x-orwell-user-email"),
    })
    .returning();
  return NextResponse.json({ dashboard }, { status: 201 });
}
export async function DELETE(request: Request) {
  const parsed = Remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dashboard not found." },
      { status: 400 },
    );
  if (
    !(await canAccessSite(request, parsed.data.siteSlug)) ||
    !(await hasPermission(request, "research", parsed.data.siteSlug))
  )
    return NextResponse.json(
      { error: "Research permission required for this website." },
      { status: 403 },
    );
  if (process.env.QA_SYNTHETIC === "true")
    return NextResponse.json({ ok: true, synthetic: true });
  if (!hasDatabase())
    return NextResponse.json(
      { error: "Saved dashboards require DATABASE_URL." },
      { status: 503 },
    );
  await db()
    .delete(schema.customDashboards)
    .where(
      and(
        eq(schema.customDashboards.id, parsed.data.id),
        eq(schema.customDashboards.scopeId, parsed.data.siteSlug),
      ),
    );
  return NextResponse.json({ ok: true });
}
