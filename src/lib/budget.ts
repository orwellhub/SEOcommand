/**
 * Spending-limit enforcement used by the scheduler and provider adapter.
 * Pure and unit-tested. See docs/cost-controls.md.
 */
export interface BudgetState {
  limitUsd: number;
  spentUsd: number;
}

export type BudgetThreshold = 50 | 75 | 90 | 100;

/** Which alert thresholds have been crossed at the current spend. */
export function crossedThresholds(state: BudgetState): BudgetThreshold[] {
  const pct = state.limitUsd === 0 ? 0 : (state.spentUsd / state.limitUsd) * 100;
  return ([50, 75, 90, 100] as BudgetThreshold[]).filter((t) => pct >= t);
}

/**
 * Decide whether a request of `estimatedCostUsd` may proceed.
 * Critical jobs may run up to the hard limit; non-critical jobs are paused once
 * the budget is fully spent (emergency pause behaviour).
 */
export function canSpend(
  state: BudgetState,
  estimatedCostUsd: number,
  opts: { critical?: boolean } = {},
): boolean {
  const projected = state.spentUsd + estimatedCostUsd;
  if (projected > state.limitUsd) return false;
  if (!opts.critical && state.spentUsd >= state.limitUsd) return false;
  return true;
}

export function remaining(state: BudgetState): number {
  return Math.max(0, state.limitUsd - state.spentUsd);
}
