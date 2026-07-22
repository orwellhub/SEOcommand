/**
 * Typed errors for the DataForSEO integration so callers (routes, jobs, UI) can
 * respond appropriately and never leak secrets or raw payloads.
 */

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "DataForSeoError";
  }
}

/** DataForSEO status 40203 — daily API-call limit reached. */
export class DailyLimitError extends DataForSeoError {
  constructor(endpoint: string, message = "DataForSEO daily API limit reached (40203).") {
    super(message, 40203, endpoint);
    this.name = "DailyLimitError";
  }
}

/** Raised by the spend guard when a call would breach the monthly budget. */
export class BudgetExceededError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly limitUsd: number,
    readonly endpoint: string,
  ) {
    super(
      `Monthly DataForSEO budget guardrail reached: $${spentUsd.toFixed(2)} of ` +
        `$${limitUsd.toFixed(2)} spent. Call to "${endpoint}" blocked.`,
    );
    this.name = "BudgetExceededError";
  }
}

export class MissingCredentialsError extends Error {
  constructor() {
    super("DataForSEO credentials are not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).");
    this.name = "MissingCredentialsError";
  }
}

/**
 * Classify a DataForSEO status code. `20000` is success; `40203` is the daily
 * limit; anything else is a hard error. DataForSEO returns statuses at both the
 * top level and per-task, so both are checked by the client.
 */
export function classifyStatus(statusCode: number): "ok" | "daily_limit" | "error" {
  if (statusCode === 20000) return "ok";
  if (statusCode === 40203) return "daily_limit";
  return "error";
}
