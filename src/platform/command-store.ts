import { and, desc, eq, inArray, notInArray, notLike, getTableColumns, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { CommandRecord } from "@/lib/command-model";

const controls = ["settings", "watch", "plan", "baseline"];
const previewGlobal=globalThis as typeof globalThis & {__seoQaCommands?:CommandRecord[]};
const qaRecords: CommandRecord[] = process.env.QA_SYNTHETIC==="true"&&process.env.NODE_ENV==="development"?(previewGlobal.__seoQaCommands??=[]):[];
function serialize(row: typeof schema.commandRecords.$inferSelect): CommandRecord {
  return { ...row, nextRunAt: row.nextRunAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/** Keep coverage independent of the 120-row activity-history window. */
export async function completedIndexInspections(siteSlug: string): Promise<CommandRecord[]> {
  if (process.env.QA_SYNTHETIC === "true") return qaRecords.filter((row) => row.siteSlug === siteSlug && row.kind === "indexing" && row.status === "completed");
  if (!hasDatabase()) return [];
  const url = sql<string>`${schema.commandRecords.payload}->>'url'`;
  const rows = await db().selectDistinctOn([url]).from(schema.commandRecords)
    .where(and(eq(schema.commandRecords.siteSlug, siteSlug), eq(schema.commandRecords.kind, "indexing"), eq(schema.commandRecords.status, "completed")))
    .orderBy(url, desc(schema.commandRecords.updatedAt));
  return rows.map(serialize);
}
export async function commandRecords(siteSlug: string): Promise<CommandRecord[]> {
  if (process.env.QA_SYNTHETIC === "true") return qaRecords.filter((row) => row.siteSlug === siteSlug);
  if (!hasDatabase()) return [];
  const ranked = db().select({ ...getTableColumns(schema.commandRecords), historyRank: sql<number>`row_number() over (partition by ${schema.commandRecords.kind} order by ${schema.commandRecords.createdAt} desc)`.as("history_rank") }).from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), notInArray(schema.commandRecords.kind, controls), notLike(schema.commandRecords.kind, "research_%"), notLike(schema.commandRecords.kind, "workspace_%"))).as("ranked_history");
  const [settings, history] = await Promise.all([
    db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), inArray(schema.commandRecords.kind, controls))).orderBy(desc(schema.commandRecords.updatedAt)),
    db().select().from(ranked).where(lte(ranked.historyRank, 120)).orderBy(desc(ranked.createdAt)),
  ]);
  return [...settings, ...history].map(serialize);
}
export async function saveCommandRecord(siteSlug: string, kind: string, recordKey: string, payload: Record<string, unknown>, options: { actor?: string | null; status?: string; nextRunAt?: Date | null } = {}) {
  const now = new Date();
  if (process.env.QA_SYNTHETIC === "true") {
    const existing = qaRecords.find((row) => row.siteSlug === siteSlug && row.kind === kind && row.recordKey === recordKey);
    const row: CommandRecord = { id: existing?.id ?? crypto.randomUUID(), siteSlug, kind, recordKey, payload: kind === "settings" ? { ...existing?.payload, ...payload } : payload, status: options.status ?? "saved", nextRunAt: options.nextRunAt?.toISOString() ?? null, createdAt: existing?.createdAt ?? now.toISOString(), updatedAt: new Date(Math.max(now.getTime(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString() };
    if (existing) qaRecords.splice(qaRecords.indexOf(existing), 1);
    qaRecords.unshift(row); return row;
  }
  if (!hasDatabase()) throw new Error("Saving requires the workspace database.");
  const values = { siteSlug, kind, recordKey, payload, status: options.status ?? "saved", nextRunAt: options.nextRunAt ?? null, createdBy: options.actor, updatedAt: now };
  const [row] = await db().insert(schema.commandRecords).values(values).onConflictDoUpdate({ target: [schema.commandRecords.siteSlug, schema.commandRecords.kind, schema.commandRecords.recordKey], set: { payload: kind === "settings" ? sql`${schema.commandRecords.payload} || ${JSON.stringify(payload)}::jsonb` : payload, status: values.status, nextRunAt: values.nextRunAt, updatedAt: now } }).returning();
  return serialize(row!);
}

export async function saveCommandPlans(sites: string[], key: string, payload: Record<string, unknown>, actor: string, start: Date) {
  if (process.env.QA_SYNTHETIC === "true") { for (const site of sites) await saveCommandRecord(site, "plan", key, payload, { actor, status: "active", nextRunAt: start }); return; }
  if (!hasDatabase()) throw new Error("Saving plans requires the workspace database.");
  // One statement is atomic across the entire selected set.
  await db().insert(schema.commandRecords).values(sites.map((siteSlug) => ({ siteSlug, kind: "plan", recordKey: key, payload, createdBy: actor, status: "active", nextRunAt: start })));
}

export async function activeCommandPlans(siteSlug: string): Promise<CommandRecord[]> {
  if (process.env.QA_SYNTHETIC === "true") return qaRecords.filter((row) => row.siteSlug === siteSlug && row.kind === "plan" && row.status === "active");
  if (!hasDatabase()) return [];
  return (await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, siteSlug), eq(schema.commandRecords.kind, "plan"), eq(schema.commandRecords.status, "active")))).map(serialize);
}
