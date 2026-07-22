import {
  basicAuthHeader,
  COST_ESTIMATE_USD,
  ENDPOINTS,
  type DataForSeoConfig,
} from "./config";
import { classifyStatus, DailyLimitError, DataForSeoError } from "./errors";
import type { GuardResult, SpendGuard } from "./cost";

/** The DataForSEO top-level response envelope (fields we rely on). */
interface DfsEnvelope<T> {
  status_code: number;
  status_message: string;
  cost: number;
  tasks_error?: number;
  tasks?: Array<{
    id: string;
    status_code: number;
    status_message: string;
    cost?: number;
    result_count?: number;
    result?: T[] | null;
  }>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

function backoffMs(attempt: number): number {
  return 2000 * 2 ** attempt; // 2s, 4s, 8s, 16s
}

/**
 * Guarded DataForSEO client. Every call passes through the monthly spend guard:
 * blocked before running if it would breach $200/month, and the actual returned
 * cost is recorded afterwards.
 */
export class DataForSeoClient {
  constructor(
    private cfg: DataForSeoConfig,
    private guard: SpendGuard,
  ) {}

  private async rawFetch(path: string, body: unknown): Promise<Response> {
    const url = `${this.cfg.baseUrl}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: basicAuthHeader(this.cfg),
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: "no-store",
        });
        if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }
      }
    }
    throw new DataForSeoError(
      `Network error calling DataForSEO: ${String(lastErr)}`,
      0,
      path,
    );
  }

  /**
   * Parse the DataForSEO envelope, enforcing status codes at both the top level
   * and the first task level, and return the first task's result rows + cost.
   */
  private parse<T>(env: DfsEnvelope<T>, path: string): { result: T[]; cost: number } {
    const topClass = classifyStatus(env.status_code);
    if (topClass === "daily_limit") throw new DailyLimitError(path);
    if (topClass === "error") {
      throw new DataForSeoError(env.status_message || "DataForSEO error", env.status_code, path);
    }
    const task = env.tasks?.[0];
    if (!task) {
      // A 20000 with no tasks is unusual but not fatal — treat as empty.
      return { result: [], cost: env.cost ?? 0 };
    }
    const taskClass = classifyStatus(task.status_code);
    if (taskClass === "daily_limit") throw new DailyLimitError(path);
    if (taskClass === "error") {
      throw new DataForSeoError(task.status_message || "DataForSEO task error", task.status_code, path);
    }
    return { result: task.result ?? [], cost: task.cost ?? env.cost ?? 0 };
  }

  /** Guarded POST returning the first task's result rows. */
  async post<T>(
    endpointKey: keyof typeof COST_ESTIMATE_USD,
    path: string,
    body: unknown,
    opts: { domainSlug?: string | null; critical?: boolean } = {},
  ): Promise<{ result: T[]; guard: GuardResult }> {
    const estimate = COST_ESTIMATE_USD[endpointKey] ?? 0.05;
    const { result, guard } = await this.guard.run<T[]>(
      { endpoint: endpointKey, estimateUsd: estimate, domainSlug: opts.domainSlug, critical: opts.critical },
      async () => {
        const res = await this.rawFetch(path, body);
        const json = (await res.json()) as DfsEnvelope<T>;
        const parsed = this.parse<T>(json, path);
        return { result: parsed.result, costUsd: parsed.cost };
      },
    );
    return { result, guard };
  }

  /** Unguarded GET for zero-cost metadata endpoints (e.g. model lists). */
  async getMeta<T>(path: string): Promise<T[]> {
    const res = await this.rawFetch(path, undefined);
    const json = (await res.json()) as DfsEnvelope<T>;
    return this.parse<T>(json, path).result;
  }

  /**
   * OnPage is asynchronous. `postOnPageTask` starts a crawl and returns the task
   * id; `fetchOnPageSummary` reads its current summary (zero-cost). The sync
   * engine stores the task id and resumes polling across runs, so a slow crawl
   * never blocks or double-pays.
   */
  async postOnPageTask(
    target: string,
    opts: { maxPages?: number; domainSlug?: string | null } = {},
  ): Promise<{ taskId: string; guard: GuardResult }> {
    const post = await this.post<{ id: string }>(
      "onPageTaskPost",
      ENDPOINTS.onPageTaskPost,
      [{ target, max_crawl_pages: opts.maxPages ?? 100 }],
      { domainSlug: opts.domainSlug, critical: false },
    );
    const taskId = post.result[0]?.id;
    if (!taskId) throw new DataForSeoError("OnPage task_post returned no task id", 0, ENDPOINTS.onPageTaskPost);
    return { taskId, guard: post.guard };
  }

  async fetchOnPageSummary(taskId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.getMeta<Record<string, unknown>>(ENDPOINTS.onPageSummary(taskId));
    return rows[0] ?? null;
  }

  /** Post + poll convenience used by one-shot flows. */
  async onPageSummary(
    target: string,
    opts: { maxPages?: number; pollMs?: number; timeoutMs?: number; domainSlug?: string | null } = {},
  ): Promise<{ summary: Record<string, unknown> | null; guard: GuardResult }> {
    const { taskId, guard } = await this.postOnPageTask(target, opts);
    const pollMs = opts.pollMs ?? 5000;
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
    while (Date.now() < deadline) {
      const summary = await this.fetchOnPageSummary(taskId);
      if (summary?.["crawl_progress"] === "finished") return { summary, guard };
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new DataForSeoError("OnPage crawl did not finish before timeout", 0, ENDPOINTS.onPageTaskPost);
  }

  async guardStatus(): Promise<GuardResult> {
    return this.guard.status();
  }
}
