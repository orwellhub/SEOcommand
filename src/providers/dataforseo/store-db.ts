import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SpendRecord, SpendStore } from "./cost";

/**
 * Durable spend store backed by the `provider_spend` table. Survives restarts so
 * the monthly guardrail is real across deploys. Requires DATABASE_URL + applied
 * migrations. Falls back gracefully at the factory level when no DB is present.
 */
export class PgSpendStore implements SpendStore {
  async monthToDateUsd(provider: string, month: string): Promise<number> {
    const rows = await db()
      .select({ total: sql<number>`COALESCE(SUM(${schema.providerSpend.costUsd}), 0)` })
      .from(schema.providerSpend)
      .where(
        and(eq(schema.providerSpend.provider, provider), eq(schema.providerSpend.month, month)),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async record(entry: SpendRecord): Promise<void> {
    await db().insert(schema.providerSpend).values({
      provider: entry.provider,
      month: entry.month,
      endpoint: entry.endpoint,
      domainSlug: entry.domainSlug ?? null,
      costUsd: entry.costUsd,
      requests: entry.requests,
    });
  }
}
