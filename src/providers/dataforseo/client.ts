import {
  basicAuthHeader,
  COST_ESTIMATE_USD,
  ENDPOINTS,
  type DataForSeoConfig,
} from "./config";
import { classifyStatus, DailyLimitError, DataForSeoError } from "./errors";
import type { GuardResult, SpendGuard } from "./cost";
import { assertSiteSpendAllowed } from "@/platform/spend-approval";

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

/** Per-request timeout — a stalled call must fail, never hang the whole sync. */
const REQUEST_TIMEOUT_MS = 45_000;

/** OnPage summary "task not ready" statuses (queued / handed / in progress). */
function isTaskNotReady(statusCode: number): boolean {
  return statusCode >= 40600 && statusCode < 40700;
}

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
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    await assertSiteSpendAllowed(opts.domainSlug, endpointKey, estimate);
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

  /**
   * Guarded POST for asynchronous task endpoints. The task id lives on the task
   * object itself (`tasks[0].id`), not in `result` (which is null for task_post),
   * so this returns the id directly.
   */
  async postTask(
    endpointKey: keyof typeof COST_ESTIMATE_USD,
    path: string,
    body: unknown,
    opts: { domainSlug?: string | null; critical?: boolean } = {},
  ): Promise<{ taskId: string | null; guard: GuardResult }> {
    const estimate = COST_ESTIMATE_USD[endpointKey] ?? 0.05;
    await assertSiteSpendAllowed(opts.domainSlug, endpointKey, estimate);
    const { result, guard } = await this.guard.run<string | null>(
      { endpoint: endpointKey, estimateUsd: estimate, domainSlug: opts.domainSlug, critical: opts.critical },
      async () => {
        const res = await this.rawFetch(path, body);
        const json = (await res.json()) as DfsEnvelope<unknown>;
        const topClass = classifyStatus(json.status_code);
        if (topClass === "daily_limit") throw new DailyLimitError(path);
        if (topClass === "error") {
          throw new DataForSeoError(json.status_message || "DataForSEO error", json.status_code, path);
        }
        const task = json.tasks?.[0] as { id?: string; status_code?: number; status_message?: string; cost?: number } | undefined;
        const taskClass = classifyStatus(task?.status_code ?? 0);
        if (taskClass === "daily_limit") throw new DailyLimitError(path);
        if (taskClass === "error") {
          throw new DataForSeoError(task?.status_message || "DataForSEO task error", task?.status_code ?? 0, path);
        }
        return { result: task?.id ?? null, costUsd: task?.cost ?? json.cost ?? 0 };
      },
    );
    return { taskId: result, guard };
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
    const { taskId, guard } = await this.postTask(
      "onPageTaskPost",
      ENDPOINTS.onPageTaskPost,
      [{ target, max_crawl_pages: opts.maxPages ?? 100 }],
      { domainSlug: opts.domainSlug, critical: false },
    );
    if (!taskId) throw new DataForSeoError("OnPage task_post returned no task id", 0, ENDPOINTS.onPageTaskPost);
    return { taskId, guard };
  }

  /**
   * Fetch an OnPage crawl summary. Returns null while the crawl is not yet ready
   * (queued / handed / in progress → the caller keeps polling on later runs)
   * rather than throwing. Only genuine failures (auth, daily limit) throw.
   */
  async fetchOnPageSummary(taskId: string): Promise<Record<string, unknown> | null> {
    const path = ENDPOINTS.onPageSummary(taskId);
    const res = await this.rawFetch(path, undefined);
    const json = (await res.json()) as DfsEnvelope<Record<string, unknown>>;
    if (classifyStatus(json.status_code) === "daily_limit") throw new DailyLimitError(path);
    const task = json.tasks?.[0];
    if (!task) return null;
    const cls = classifyStatus(task.status_code);
    if (cls === "ok") return (task.result?.[0] as Record<string, unknown>) ?? null;
    if (cls === "daily_limit") throw new DailyLimitError(path);
    if (isTaskNotReady(task.status_code)) return null; // still crawling — keep polling
    throw new DataForSeoError(task.status_message || "OnPage summary error", task.status_code, path);
  }

  /** Page-level crawl results. Result retrieval is free after the paid task. */
  async fetchOnPagePages(
    taskId: string,
    limit = 1000,
    offset = 0,
  ): Promise<Record<string, unknown>[]> {
    const { result } = await this.post<Record<string, unknown>>(
      "onPagePages",
      ENDPOINTS.onPagePages,
      [{ id: taskId, limit: Math.min(Math.max(limit, 1), 1000), offset }],
      { critical: true },
    );
    return result;
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
