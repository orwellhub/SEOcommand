import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Spend actor context. Paid work started on behalf of a named actor (for
 * example the Claude MCP connector, actor "claude-mcp") runs inside this
 * context so every guarded DataForSEO request it makes:
 *
 *  - is recorded on the provider_spend ledger with that actor, and
 *  - is refused before it runs if the actor's own monthly budget would be
 *    passed. The overall $200/month SpendGuard and the per-site ceilings still
 *    apply on top; this only ever narrows what may be spent.
 *
 * Work outside any context is recorded as the default actor ("app").
 */
export const DEFAULT_SPEND_ACTOR = "app";

export interface SpendActorContext {
  /** Ledger label, e.g. "claude-mcp". */
  actor: string;
  /** Monthly cap for this actor in USD; null means no actor-level cap. */
  monthlyLimitUsd: number | null;
  /** Running total of actual cost recorded inside this context (USD). */
  spentUsd: number;
  /** Number of paid provider requests recorded inside this context. */
  requests: number;
}

const storage = new AsyncLocalStorage<SpendActorContext>();

export function createSpendActor(context: { actor: string; monthlyLimitUsd: number | null }): SpendActorContext {
  return { ...context, spentUsd: 0, requests: 0 };
}

/** Run `fn` with `context` as the current spend actor. The context's running
 * totals stay readable afterwards, including when `fn` throws part-way. */
export function runInSpendActor<T>(context: SpendActorContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function currentSpendActor(): SpendActorContext | undefined {
  return storage.getStore();
}
