import { canSpend, crossedThresholds, remaining, type BudgetThreshold } from "@/lib/budget";
import { currentSpendActor, DEFAULT_SPEND_ACTOR } from "./actor";
import { ActorBudgetExceededError, BudgetExceededError } from "./errors";

/**
 * App-owned monthly spending guardrail for DataForSEO.
 *
 * DataForSEO has no native monthly cap — the daily limit is not the control — so
 * the application enforces the ceiling itself: it tracks cumulative spend per
 * calendar month, blocks a call *before* it would breach the limit, records the
 * *actual* cost DataForSEO returns after each call, and reports how close spend
 * is to the ceiling so the UI can warn.
 *
 * Paid work started on behalf of a named actor (src/providers/dataforseo/actor.ts,
 * e.g. the Claude MCP connector) is additionally capped by that actor's own
 * monthly budget and recorded with the actor on the ledger. The actor cap only
 * narrows spend; the overall limit above always applies.
 */

export interface SpendRecord {
  id?: string;
  provider: string;
  month: string; // YYYY-MM
  endpoint: string;
  domainSlug?: string | null;
  costUsd: number;
  requests: number;
  /** Who started the paid work. Defaults to "app" (scheduler and dashboard). */
  actor?: string | null;
}

export interface SpendStore {
  reservedUsd?(month: string, excludeId?: string): Promise<number>;
  monthToDateUsd(provider: string, month: string): Promise<number>;
  /** Month-to-date spend recorded for one actor. Required for actor caps. */
  actorMonthToDateUsd?(provider: string, month: string, actor: string): Promise<number>;
  record(entry: SpendRecord): Promise<void>;
}

/** UTC "YYYY-MM" for a given date (defaults to now). Pass a clock for tests. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Process-local store — used for tests and when no database is configured. */
export class InMemorySpendStore implements SpendStore {
  private totals = new Map<string, number>();
  private actorTotals = new Map<string, number>();
  private key(provider: string, month: string) {
    return `${provider}:${month}`;
  }
  async monthToDateUsd(provider: string, month: string): Promise<number> {
    return this.totals.get(this.key(provider, month)) ?? 0;
  }
  async actorMonthToDateUsd(provider: string, month: string, actor: string): Promise<number> {
    return this.actorTotals.get(`${this.key(provider, month)}:${actor}`) ?? 0;
  }
  async record(entry: SpendRecord): Promise<void> {
    const k = this.key(entry.provider, entry.month);
    this.totals.set(k, (this.totals.get(k) ?? 0) + entry.costUsd);
    const actorKey = `${k}:${entry.actor ?? DEFAULT_SPEND_ACTOR}`;
    this.actorTotals.set(actorKey, (this.actorTotals.get(actorKey) ?? 0) + entry.costUsd);
  }
}

export interface GuardResult {
  reservedUsd?: number;
  spentUsd: number;
  limitUsd: number;
  remainingUsd: number;
  pctUsed: number;
  crossed: BudgetThreshold[];
}

export class SpendGuard {
  constructor(
    private store: SpendStore,
    private limitUsd: number,
    private provider = "dataforseo",
    private clock: () => Date = () => new Date(),
  ) {}

  async status(): Promise<GuardResult> {
    const month = currentMonth(this.clock());
    const spent = await this.store.monthToDateUsd(this.provider, month);
    return this.toResult(spent, await this.store.reservedUsd?.(month) ?? 0);
  }

  private toResult(spent: number, reserved = 0): GuardResult {
    const pct = this.limitUsd === 0 ? 0 : ((spent + reserved) / this.limitUsd) * 100;
    return {
      spentUsd: spent,
      ...(reserved > 0 ? { reservedUsd: reserved } : {}),
      limitUsd: this.limitUsd,
      remainingUsd: remaining({ limitUsd: this.limitUsd, spentUsd: spent + reserved }),
      pctUsed: Math.round(pct * 10) / 10,
      crossed: crossedThresholds({ limitUsd: this.limitUsd, spentUsd: spent }),
    };
  }

  /**
   * Run `fn` under the guardrail. Throws BudgetExceededError *before* calling if
   * the estimated cost would breach the monthly limit; records the actual cost
   * returned by `fn` afterwards. Critical jobs may run up to the hard limit;
   * non-critical jobs are paused once fully spent.
   */
  async run<T>(
    opts: {
      endpoint: string;
      estimateUsd: number;
      domainSlug?: string | null;
      critical?: boolean;
      requests?: number;
      requestId?: string;
    },
    fn: () => Promise<{ result: T; costUsd: number }>,
  ): Promise<{ result: T; guard: GuardResult; costUsd: number }> {
    const month = currentMonth(this.clock());
    const spent = await this.store.monthToDateUsd(this.provider, month);
    const reserved = await this.store.reservedUsd?.(month, opts.requestId) ?? 0;
    if (!canSpend({ limitUsd: this.limitUsd, spentUsd: spent + reserved }, opts.estimateUsd, { critical: opts.critical })) {
      throw new BudgetExceededError(spent, this.limitUsd, opts.endpoint);
    }

    // Actor budget: checked before every paid request made on an actor's
    // behalf, so a multi-request run stops as soon as the next request would
    // pass the cap. A store that cannot report actor spend fails closed.
    const actor = currentSpendActor();
    if (actor && actor.monthlyLimitUsd != null) {
      if (!this.store.actorMonthToDateUsd) {
        throw new ActorBudgetExceededError(actor.actor, 0, actor.monthlyLimitUsd, `${opts.endpoint} (actor spend unavailable)`, opts.estimateUsd);
      }
      const actorSpent = await this.store.actorMonthToDateUsd(this.provider, month, actor.actor);
      if (!(actor.monthlyLimitUsd > 0) || actorSpent + opts.estimateUsd > actor.monthlyLimitUsd) {
        throw new ActorBudgetExceededError(actor.actor, actorSpent, actor.monthlyLimitUsd, opts.endpoint, opts.estimateUsd);
      }
    }

    const { result, costUsd } = await fn();
    const actualCostUsd = Number.isFinite(costUsd) ? costUsd : 0;

    await this.store.record({
      ...(opts.requestId ? { id: opts.requestId } : {}),
      provider: this.provider,
      month,
      endpoint: opts.endpoint,
      domainSlug: opts.domainSlug ?? null,
      costUsd: actualCostUsd,
      requests: opts.requests ?? 1,
      actor: actor?.actor ?? DEFAULT_SPEND_ACTOR,
    });
    if (actor) {
      actor.spentUsd += actualCostUsd;
      actor.requests += opts.requests ?? 1;
    }

    return { result, costUsd: actualCostUsd, guard: this.toResult(spent + actualCostUsd, reserved) };
  }
}
