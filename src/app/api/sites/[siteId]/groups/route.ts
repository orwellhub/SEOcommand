import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { isManagedSite, setSiteGroups } from "@/platform/site-store";
import { canAccessSite } from "@/platform/access";

const Schema = z.object({ groupIds: z.array(z.string().uuid()).max(20) });

export async function PUT(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!(await isManagedSite(siteId))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, siteId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") {
    const parsed = Schema.safeParse(await request.json().catch(() => null));
    return parsed.success
      ? NextResponse.json({ siteSlug: siteId, groupIds: parsed.data.groupIds, synthetic: true })
      : NextResponse.json({ error: "Invalid group selection." }, { status: 400 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid group selection." }, { status: 400 });
  const ids = [...new Set(parsed.data.groupIds)];
  if (ids.length) {
    const valid = await db().select({ id: schema.portfolioGroups.id }).from(schema.portfolioGroups).where(inArray(schema.portfolioGroups.id, ids));
    if (valid.length !== ids.length) return NextResponse.json({ error: "One or more groups no longer exist." }, { status: 400 });
  }
  await setSiteGroups(siteId, ids);
  return NextResponse.json({ siteSlug: siteId, groupIds: ids });
}
