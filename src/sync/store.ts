import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Provenance } from "@/lib/types";

/**
 * Snapshot store — the live read-model persistence layer. One row per
 * (domain, dataset, day); same-day re-sync upserts. Pages read the latest row
 * per dataset; history datasets read all rows ascending.
 */

export interface StoredSnapshot {
  dataset: string;
  capturedOn: string;
  payload: unknown;
  provenance: Provenance;
}

export async function writeSnapshot(
  domainSlug: string,
  dataset: string,
  capturedOn: string,
  payload: unknown,
  provenance: Provenance,
): Promise<void> {
  await db()
    .insert(schema.datasetSnapshots)
    .values({ domainSlug, dataset, capturedOn, payload, provenance })
    .onConflictDoUpdate({
      target: [
        schema.datasetSnapshots.domainSlug,
        schema.datasetSnapshots.dataset,
        schema.datasetSnapshots.capturedOn,
      ],
      set: { payload, provenance, createdAt: sql`now()` },
    });
}

/** Latest snapshot per dataset for one domain (single query). */
export async function readLatestSnapshots(domainSlug: string): Promise<StoredSnapshot[]> {
  const rows = await db()
    .selectDistinctOn([schema.datasetSnapshots.dataset], {
      dataset: schema.datasetSnapshots.dataset,
      capturedOn: schema.datasetSnapshots.capturedOn,
      payload: schema.datasetSnapshots.payload,
      provenance: schema.datasetSnapshots.provenance,
    })
    .from(schema.datasetSnapshots)
    .where(eq(schema.datasetSnapshots.domainSlug, domainSlug))
    .orderBy(schema.datasetSnapshots.dataset, desc(schema.datasetSnapshots.capturedOn));
  return rows as StoredSnapshot[];
}

/** Full history of one dataset (ascending) — for accumulated series. */
export async function readSnapshotHistory(
  domainSlug: string,
  dataset: string,
): Promise<StoredSnapshot[]> {
  const rows = await db()
    .select({
      dataset: schema.datasetSnapshots.dataset,
      capturedOn: schema.datasetSnapshots.capturedOn,
      payload: schema.datasetSnapshots.payload,
      provenance: schema.datasetSnapshots.provenance,
    })
    .from(schema.datasetSnapshots)
    .where(
      and(
        eq(schema.datasetSnapshots.domainSlug, domainSlug),
        eq(schema.datasetSnapshots.dataset, dataset),
      ),
    )
    .orderBy(asc(schema.datasetSnapshots.capturedOn));
  return rows as StoredSnapshot[];
}

/** Latest snapshots for many domains at once (portfolio aggregation). */
export async function readLatestForDomains(
  domainSlugs: string[],
): Promise<Map<string, StoredSnapshot[]>> {
  const rows = await db()
    .selectDistinctOn([schema.datasetSnapshots.domainSlug, schema.datasetSnapshots.dataset], {
      domainSlug: schema.datasetSnapshots.domainSlug,
      dataset: schema.datasetSnapshots.dataset,
      capturedOn: schema.datasetSnapshots.capturedOn,
      payload: schema.datasetSnapshots.payload,
      provenance: schema.datasetSnapshots.provenance,
    })
    .from(schema.datasetSnapshots)
    .where(inArray(schema.datasetSnapshots.domainSlug, domainSlugs))
    .orderBy(
      schema.datasetSnapshots.domainSlug,
      schema.datasetSnapshots.dataset,
      desc(schema.datasetSnapshots.capturedOn),
    );
  const out = new Map<string, StoredSnapshot[]>();
  for (const r of rows as (StoredSnapshot & { domainSlug: string })[]) {
    const list = out.get(r.domainSlug) ?? [];
    list.push(r);
    out.set(r.domainSlug, list);
  }
  return out;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
