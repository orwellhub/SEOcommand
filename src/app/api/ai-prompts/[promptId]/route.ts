import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { canAccessSite, hasPermission } from "@/platform/access";

const UpdateSchema = z.object({
  prompt: z.string().trim().min(8).max(1000).optional(),
  topic: z.string().trim().min(2).max(100).optional(),
  platforms: z.array(z.enum(["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview", "google_ai_mode", "copilot"])).min(1).optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  sampleCount: z.number().int().min(1).max(5).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the prompt fields." }, { status: 400 });
  const [existing] = await db().select().from(schema.aiTrackingPrompts).where(eq(schema.aiTrackingPrompts.id, promptId)).limit(1);
  if (!existing || !await canAccessSite(request, existing.siteSlug)) return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
  if (!await hasPermission(request, "manage_content", existing.siteSlug)) return NextResponse.json({ error: "AI prompt permission required for this website." }, { status: 403 });
  const [prompt] = await db().update(schema.aiTrackingPrompts).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.aiTrackingPrompts.id, promptId)).returning();
  if (!prompt) return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
  return NextResponse.json({ prompt });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  if (!hasDatabase()) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 503 });
  const [existing] = await db().select().from(schema.aiTrackingPrompts).where(eq(schema.aiTrackingPrompts.id, promptId)).limit(1);
  if (!existing || !await canAccessSite(request, existing.siteSlug)) return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
  if (!await hasPermission(request, "manage_content", existing.siteSlug)) return NextResponse.json({ error: "AI prompt permission required for this website." }, { status: 403 });
  await db().delete(schema.aiTrackingPrompts).where(eq(schema.aiTrackingPrompts.id, promptId));
  return NextResponse.json({ deleted: true });
}
