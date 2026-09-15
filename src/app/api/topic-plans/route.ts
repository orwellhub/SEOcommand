import {validResearchProject} from "@/platform/research-projects";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";
import { readLatestSnapshots } from "@/sync/store";
import { commandRecords, saveCommandRecord } from "@/platform/command-store";
import { keywordEffort } from "@/lib/planning";
import type { Keyword } from "@/lib/types";
import { siteUrl } from "@/lib/command-model";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site") ?? "";
  if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ plans: (await commandRecords(site)).filter(r=>r.kind==="workspace_topic").map(r=>({id:r.recordKey,...r.payload,updatedAt:r.updatedAt})), effort: keywordEffort([]), collectedAt: null });
  const [records, snapshots] = await Promise.all([db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, site), eq(schema.commandRecords.kind, "workspace_topic"))).orderBy(desc(schema.commandRecords.updatedAt)), readLatestSnapshots(site)]);
  const keywords = snapshots.find((s) => s.dataset === "keywords");
  return NextResponse.json({ plans: records.map((r) => ({ id: r.recordKey, ...r.payload, updatedAt: r.updatedAt.toISOString() })), effort: keywordEffort(Array.isArray(keywords?.payload) ? keywords.payload as Keyword[] : []), collectedAt: keywords?.provenance.collectedAt ?? null });
}
const inputSchema = z.object({ projectId:z.string().uuid().optional(),site: z.string().min(1).max(120), id: z.string().uuid().optional(), label: z.string().trim().min(2).max(150), keywords: z.array(z.string().trim().min(1).max(250)).min(1).max(100), targetUrl: z.string().max(2000), sourceEvidence: z.record(z.string(), z.unknown()).optional(), updatedAt: z.string().datetime().optional() });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a topic, keywords and a destination on this website." }, { status: 400 });
  const body = parsed.data;
  if (!await canAccessSite(request, body.site) || !await hasPermission(request, "manage_content", body.site)) return NextResponse.json({ error: "Content access required." }, { status: 403 });
  if(!await validResearchProject(body.projectId,body.site))return NextResponse.json({error:"Choose an active research project for this website."},{status:400});
  const site = await getManagedSite(body.site), url = site && siteUrl(body.targetUrl, site.host);
  if (!site || !url) return NextResponse.json({ error: "Use an existing or planned page on this website." }, { status: 400 });
  const id = body.id ?? crypto.randomUUID();
  const payload = { ...(body.projectId?{projectId:body.projectId}:{}),...(body.sourceEvidence ? {sourceEvidence:body.sourceEvidence} : {}), label: body.label, keywords: [...new Set(body.keywords)], targetUrl: url };
  if (process.env.QA_SYNTHETIC === "true") {
    const previous=(await commandRecords(site.id)).find(r=>r.kind==="workspace_topic"&&r.recordKey===id);
    if(body.id&&(!previous||!body.updatedAt||previous.updatedAt!==body.updatedAt))return NextResponse.json({error:"This plan changed. Reload it before saving."},{status:409});
    await saveCommandRecord(site.id,"workspace_topic",id,{...previous?.payload,...payload});
    return NextResponse.json({id,targetUrl:url,message:"Synthetic topic plan saved."});
  }
  if (body.id) {
    if (!body.updatedAt) return NextResponse.json({ error: "Reopen the plan before editing." }, { status: 409 });
    const [row] = await db().update(schema.commandRecords).set({ payload: sql`${schema.commandRecords.payload} || ${JSON.stringify(payload)}::jsonb`, updatedAt: new Date() }).where(and(eq(schema.commandRecords.siteSlug, site.id), eq(schema.commandRecords.kind, "workspace_topic"), eq(schema.commandRecords.recordKey, body.id), eq(schema.commandRecords.updatedAt, new Date(body.updatedAt)))).returning();
    if (!row) return NextResponse.json({ error: "This plan changed in another session. Reload it before saving." }, { status: 409 });
  } else await saveCommandRecord(site.id, "workspace_topic", id, payload);
  return NextResponse.json({ id, targetUrl: url, message: "Topic group and page assignment saved." });
}
