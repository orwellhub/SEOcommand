import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SpendRecord, SpendStore } from "./cost";
import { DEFAULT_SPEND_ACTOR } from "./actor";
import { uncertainResearchSpend } from "./reservations";

/** Postgres "undefined column" for provider_spend.actor (pre-0017 database). */
function isMissingActorColumn(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const candidate = current as { code?: string; message?: string; cause?: unknown };
    if (candidate.code === "42703" && /actor/.test(candidate.message ?? "")) return true;
    current = candidate.cause;
  }
  return false;
}

/**
 * Durable spend store backed by the `provider_spend` table. Survives restarts so
 * the monthly guardrail is real across deploys. Requires DATABASE_URL + applied
 * migrations. Falls back gracefully at the factory level when no DB is present.
 */
export class PgSpendStore implements SpendStore {
  async reservedUsd(month: string, excludeId?: string) { return uncertainResearchSpend(month, { excludeId }); }
  async monthToDateUsd(provider: string, month: string): Promise<number> {
    const rows = await db()
      .select({ total: sql<number>`COALESCE(SUM(${schema.providerSpend.costUsd}), 0)` })
      .from(schema.providerSpend)
      .where(
        and(eq(schema.providerSpend.provider, provider), eq(schema.providerSpend.month, month)),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async actorMonthToDateUsd(provider: string, month: string, actor: string): Promise<number> {
    const rows = await db()
      .select({ total: sql<number>`COALESCE(SUM(${schema.providerSpend.costUsd}), 0)` })
      .from(schema.providerSpend)
      .where(
        and(
          eq(schema.providerSpend.provider, provider),
          eq(schema.providerSpend.month, month),
          eq(schema.providerSpend.actor, actor),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async record(entry: SpendRecord): Promise<void> {
    try {
      await db().insert(schema.providerSpend).values({
        ...(entry.id ? { id: entry.id } : {}),
        provider: entry.provider,
        month: entry.month,
        endpoint: entry.endpoint,
        domainSlug: entry.domainSlug ?? null,
        costUsd: entry.costUsd,
        requests: entry.requests,
        actor: entry.actor ?? DEFAULT_SPEND_ACTOR,
      }).onConflictDoNothing();
    } catch (error) {
      if (!isMissingActorColumn(error)) throw error;
      // Database not yet migrated to 0017: the provider has already charged,
      // so the cost must still reach the ledger or the monthly guardrail would
      // undercount. Actor caps fail closed until the migration runs, because
      // actorMonthToDateUsd cannot read the missing column.
      await db().execute(sql`insert into provider_spend (id, provider, month, endpoint, domain_slug, cost_usd, requests)
        values (${entry.id ? sql`${entry.id}::uuid` : sql`gen_random_uuid()`}, ${entry.provider}, ${entry.month}, ${entry.endpoint}, ${entry.domainSlug ?? null}, ${entry.costUsd}, ${entry.requests})
        on conflict do nothing`);
    }
  }
}
