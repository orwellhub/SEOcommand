import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSpendActor, runInSpendActor } from "@/providers/dataforseo/actor";
import { currentMonth, InMemorySpendStore, SpendGuard, type GuardResult, type SpendStore } from "@/providers/dataforseo/cost";
import { PgSpendStore } from "@/providers/dataforseo/store-db";
import { hasDatabase } from "@/sync/store";
import { MCP_ACTOR, mcpMonthlyBudgetUsd } from "./config";
import { McpToolError } from "./internal";

/**
 * The connector's own DataForSEO budget (actor "claude-mcp").
 *
 * Two layers protect every paid tool:
 *  1. A pre-flight check here refuses the tool with a clear message when its
 *     estimated cost plus the actor's month-to-date spend would pass the actor
 *     cap, or would pass the overall monthly guardrail.
 *  2. The tool then runs inside the actor spend context, so SpendGuard checks
 *     the actor cap again before every individual provider request and records
 *     the actor on each ledger row. A run whose real cost outgrows its
 *     estimate stops at the cap instead of overspending.
 * The overall $200/month SpendGuard and per-site ceilings still apply on top.
 */

const PROVIDER = "dataforseo";

export function overallMonthlyLimitUsd(): number {
  return Number(process.env.MONTHLY_BUDGET_USD ?? "200");
}

function spendStore(): SpendStore {
  return hasDatabase() ? new PgSpendStore() : new InMemorySpendStore();
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export interface McpBudgetStatus {
  month: string;
  actor: string;
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  pctUsed: number;
}

export async function mcpBudgetStatus(store: SpendStore = spendStore(), now = new Date()): Promise<McpBudgetStatus> {
  const month = currentMonth(now);
  const limitUsd = mcpMonthlyBudgetUsd();
  const spentUsd = await store.actorMonthToDateUsd!(PROVIDER, month, MCP_ACTOR);
  return {
    month,
    actor: MCP_ACTOR,
    spentUsd: round(spentUsd),
    limitUsd,
    remainingUsd: round(Math.max(0, limitUsd - spentUsd)),
    pctUsed: limitUsd > 0 ? Math.round((spentUsd / limitUsd) * 1000) / 10 : 100,
  };
}

export async function overallBudgetStatus(store: SpendStore = spendStore()): Promise<GuardResult> {
  return new SpendGuard(store, overallMonthlyLimitUsd()).status();
}

/** Month-to-date spend per actor (database only). */
export async function spendByActor(now = new Date()): Promise<Array<{ actor: string; costUsd: number; requests: number }>> {
  if (!hasDatabase()) return [];
  const rows = await db()
    .select({
      actor: schema.providerSpend.actor,
      costUsd: sql<number>`COALESCE(SUM(${schema.providerSpend.costUsd}), 0)::float`,
      requests: sql<number>`COALESCE(SUM(${schema.providerSpend.requests}), 0)::int`,
    })
    .from(schema.providerSpend)
    .where(and(eq(schema.providerSpend.provider, PROVIDER), eq(schema.providerSpend.month, currentMonth(now))))
    .groupBy(schema.providerSpend.actor)
    .orderBy(sql`SUM(${schema.providerSpend.costUsd}) DESC`);
  return rows.map((row) => ({ actor: row.actor, costUsd: round(Number(row.costUsd)), requests: Number(row.requests) }));
}

/**
 * Refuse a paid tool before anything is spent when its estimate does not fit
 * the claude-mcp budget or the overall guardrail.
 */
export async function assertMcpBudget(estimateUsd: number, store: SpendStore = spendStore()): Promise<{ actor: McpBudgetStatus; overall: GuardResult }> {
  if (!hasDatabase() && process.env.QA_SYNTHETIC !== "true") {
    throw new McpToolError("Paid tools need DATABASE_URL so the claude-mcp budget and spend ledger are durable.");
  }
  const actor = await mcpBudgetStatus(store);
  if (actor.limitUsd <= 0) {
    throw new McpToolError("Paid tools are disabled: SEOCOMMAND_MCP_MONTHLY_BUDGET_USD is 0 or invalid.", { budget: actor });
  }
  if (actor.spentUsd + estimateUsd > actor.limitUsd) {
    throw new McpToolError(
      `Refused before spending: this call is estimated at $${estimateUsd.toFixed(2)}, and the ${MCP_ACTOR} budget has $${actor.remainingUsd.toFixed(2)} of $${actor.limitUsd.toFixed(2)} left this month (${actor.month}). Nothing was charged.`,
      { estimateUsd: round(estimateUsd), budget: actor },
    );
  }
  const overall = await overallBudgetStatus(store);
  const committed = overall.spentUsd + (overall.reservedUsd ?? 0);
  if (committed + estimateUsd > overall.limitUsd) {
    throw new McpToolError(
      `Refused before spending: this call is estimated at $${estimateUsd.toFixed(2)}, and the overall DataForSEO guardrail has $${overall.remainingUsd.toFixed(2)} of $${overall.limitUsd.toFixed(2)} left this month. Nothing was charged.`,
      { estimateUsd: round(estimateUsd), overall },
    );
  }
  return { actor, overall };
}

export interface PaidRun<T> {
  result: T;
  estimateUsd: number;
  costUsd: number;
  requests: number;
  budget: McpBudgetStatus;
}

/** Pre-flight check, then run `fn` as the claude-mcp spend actor. A failure
 * part-way still reports what was actually charged before it stopped. */
export async function runPaid<T>(estimateUsd: number, fn: () => Promise<T>): Promise<PaidRun<T>> {
  await assertMcpBudget(estimateUsd);
  const context = createSpendActor({ actor: MCP_ACTOR, monthlyLimitUsd: mcpMonthlyBudgetUsd() });
  let result: T;
  try {
    result = await runInSpendActor(context, fn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof McpToolError ? error.details : undefined;
    throw new McpToolError(message, {
      ...details,
      estimateUsd: round(estimateUsd),
      costUsd: round(context.spentUsd),
      requests: context.requests,
      budget: await mcpBudgetStatus().catch(() => undefined),
    });
  }
  return {
    result,
    estimateUsd: round(estimateUsd),
    costUsd: round(context.spentUsd),
    requests: context.requests,
    budget: await mcpBudgetStatus(),
  };
}

/** Run free work as the claude-mcp actor without a pre-flight check. If the
 * work unexpectedly makes a paid request, the actor cap still applies to it
 * and it is recorded against claude-mcp. */
export async function runAsMcpActor<T>(fn: () => Promise<T>): Promise<{ result: T; costUsd: number; requests: number }> {
  const context = createSpendActor({ actor: MCP_ACTOR, monthlyLimitUsd: mcpMonthlyBudgetUsd() });
  const result = await runInSpendActor(context, fn);
  return { result, costUsd: round(context.spentUsd), requests: context.requests };
}
