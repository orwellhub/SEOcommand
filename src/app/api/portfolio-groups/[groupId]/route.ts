import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { listPortfolioGroups } from "@/platform/site-store";
import { hasPermission } from "@/platform/access";

const UpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Portfolio-structure permission required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ group: { id: groupId, ...(await request.json().catch(() => ({}))), synthetic: true } });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the group details." }, { status: 400 });
  const groups = await listPortfolioGroups();
  const current = groups.find((group) => group.id === groupId);
  if (!current) return NextResponse.json({ error: "Group not found." }, { status: 404 });
  if (parsed.data.parentId === groupId) return NextResponse.json({ error: "A group cannot contain itself." }, { status: 400 });
  if (parsed.data.parentId) {
    const descendants = new Set<string>();
    const visit = (id: string) => {
      for (const child of groups.filter((group) => group.parentId === id)) {
        descendants.add(child.id);
        visit(child.id);
      }
    };
    visit(groupId);
    if (descendants.has(parsed.data.parentId)) {
      return NextResponse.json({ error: "Move the child group first to avoid a circular hierarchy." }, { status: 400 });
    }
  }
  const [group] = await db().update(schema.portfolioGroups).set({ ...parsed.data, updatedAt: new Date() }).where(eq(schema.portfolioGroups.id, groupId)).returning();
  return NextResponse.json({ group });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!await hasPermission(request, "manage_content")) return NextResponse.json({ error: "Portfolio-structure permission required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ deleted: true, groupId, synthetic: true });
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  await db().transaction(async (tx) => {
    await tx.update(schema.portfolioGroups).set({ parentId: null, updatedAt: new Date() }).where(eq(schema.portfolioGroups.parentId, groupId));
    await tx.delete(schema.siteGroupMemberships).where(eq(schema.siteGroupMemberships.groupId, groupId));
    await tx.delete(schema.portfolioGroups).where(eq(schema.portfolioGroups.id, groupId));
  });
  return NextResponse.json({ deleted: true });
}
