import { canSpend, crossedThresholds, remaining, type BudgetThreshold } from "@/lib/budget";
import { BudgetExceededError } from "./errors";

/**
 * App-owned monthly spending guardrail for DataForSEO.
 *
 * DataForSEO has no native monthly cap — the daily limit is not the control — so
 * the application enforces the ceiling itself: it tracks cumulative spend per
 * calendar month, blocks a call *before* it would breach the limit, records the
 * *actual* cost DataForSEO returns after each call, and reports how close spend
 * is to the ceiling so the UI can warn.
 */

export interface SpendRecord {
  provider: string;
  month: string; // YYYY-MM
  endpoint: string;
  domainSlug?: string | null;
  costUsd: number;
  requests: number;
}

export interface SpendStore {
  monthToDateUsd(provider: string, month: string): Promise<number>;
  record(entry: SpendRecord): Promise<void>;
}

/** UTC "YYYY-MM" for a given date (defaults to now). Pass a clock for tests. */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Process-local store — used for tests and when no database is configured. */
export class InMemorySpendStore implements SpendStore {
  private totals = new Map<string, number>();
  private key(provider: string, month: string) {
    return `${provider}:${month}`;
  }
  async monthToDateUsd(provider: string, month: string): Promise<number> {
    return this.totals.get(this.key(provider, month)) ?? 0;
  }
  async record(entry: SpendRecord): Promise<void> {
    const k = this.key(entry.provider, entry.month);
    this.totals.set(k, (this.totals.get(k) ?? 0) + entry.costUsd);
  }
}

export interface GuardResult {
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
    return this.toResult(spent);
  }

  private toResult(spent: number): GuardResult {
    const pct = this.limitUsd === 0 ? 0 : (spent / this.limitUsd) * 100;
    return {
      spentUsd: spent,
      limitUsd: this.limitUsd,
      remainingUsd: remaining({ limitUsd: this.limitUsd, spentUsd: spent }),
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
    },
    fn: () => Promise<{ result: T; costUsd: number }>,
  ): Promise<{ result: T; guard: GuardResult }> {
    const month = currentMonth(this.clock());
    const spent = await this.store.monthToDateUsd(this.provider, month);
    if (!canSpend({ limitUsd: this.limitUsd, spentUsd: spent }, opts.estimateUsd, { critical: opts.critical })) {
      throw new BudgetExceededError(spent, this.limitUsd, opts.endpoint);
    }

    const { result, costUsd } = await fn();

    await this.store.record({
      provider: this.provider,
      month,
      endpoint: opts.endpoint,
      domainSlug: opts.domainSlug ?? null,
      costUsd: Number.isFinite(costUsd) ? costUsd : 0,
      requests: opts.requests ?? 1,
    });

    return { result, guard: this.toResult(spent + (Number.isFinite(costUsd) ? costUsd : 0)) };
  }
}
