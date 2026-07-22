/**
 * Scheduled jobs runner (invoked by the Render cron worker: `npm run jobs`).
 *
 * Jobs are idempotent and observable: each logs start/end, request counts and
 * cost. In demo mode there is nothing to sync, so every job is a safe no-op that
 * records why it skipped. When a live provider is connected, each job fans out to
 * the provider adapter, writes immutable snapshots and appends to the usage ledger.
 *
 * This intentionally does NOT import a database at module load, so it runs in any
 * environment. Enable real work by setting SEO_PROVIDER=dataforseo + credentials.
 */

interface JobResult {
  job: string;
  status: "ok" | "skipped" | "error";
  requests: number;
  costUsd: number;
  note: string;
}

const SCHEDULE = [
  { job: "tracked-keyword-collection", cadence: "daily" },
  { job: "gsc-sync", cadence: "daily" },
  { job: "ga4-sync", cadence: "daily" },
  { job: "backlink-changes", cadence: "daily" },
  { job: "technical-crawl", cadence: "weekly" },
  { job: "competitor-refresh", cadence: "weekly" },
  { job: "ai-prompt-checks", cadence: "configurable" },
  { job: "report-generation", cadence: "scheduled" },
  { job: "anomaly-detection", cadence: "daily" },
];

async function runJob(job: string): Promise<JobResult> {
  const providerMode = process.env.SEO_PROVIDER ?? "demo";

  if (providerMode === "demo") {
    return {
      job,
      status: "skipped",
      requests: 0,
      costUsd: 0,
      note: "Demo mode — no live provider connected; nothing to sync.",
    };
  }

  // --- Live path ---
  // The provider client wraps every call in the monthly spend guard, so budget
  // enforcement, retry/backoff and cost recording happen automatically. Jobs
  // that map to a provider fetch run it; others are placeholders pending wiring.
  const { getSeoProvider } = await import("../src/providers");
  const { DOMAINS } = await import("../src/data/domains");
  const { BudgetExceededError, DailyLimitError } = await import("../src/providers/dataforseo/errors");
  const provider = getSeoProvider();

  const fetcher: Record<string, ((id: (typeof DOMAINS)[number]["id"]) => Promise<unknown>) | undefined> = {
    "tracked-keyword-collection": (id) => provider.rankSnapshots(id),
    "backlink-changes": (id) => provider.backlinks(id),
    "competitor-refresh": (id) => provider.competitors(id),
    "technical-crawl": (id) => provider.health(id),
    "ai-prompt-checks": (id) => provider.prompts(id),
  };

  const run = fetcher[job];
  if (!run) {
    return { job, status: "skipped", requests: 0, costUsd: 0, note: "No provider mapping for this job yet." };
  }

  let requests = 0;
  try {
    for (const d of DOMAINS) {
      await run(d.id);
      requests++;
    }
    return { job, status: "ok", requests, costUsd: 0, note: "Synced (cost recorded to spend ledger)." };
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return { job, status: "skipped", requests, costUsd: 0, note: `Paused: monthly budget guardrail reached.` };
    }
    if (err instanceof DailyLimitError) {
      return { job, status: "skipped", requests, costUsd: 0, note: "Paused: DataForSEO daily limit (40203)." };
    }
    return {
      job,
      status: "error",
      requests,
      costUsd: 0,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const runAt = process.env.JOB_RUN_AT ?? "scheduled run";
  console.log(`[orwell-jobs] Starting scheduled run (${runAt}) — provider=${process.env.SEO_PROVIDER ?? "demo"}`);
  const results: JobResult[] = [];
  for (const { job, cadence } of SCHEDULE) {
    const res = await runJob(job);
    results.push(res);
    console.log(
      `[orwell-jobs] ${job} (${cadence}): ${res.status} — ${res.requests} req, $${res.costUsd.toFixed(2)} — ${res.note}`,
    );
  }
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  console.log(`[orwell-jobs] Complete. ${results.length} jobs, total cost $${totalCost.toFixed(2)}.`);
}

main().catch((err) => {
  console.error("[orwell-jobs] Fatal error:", err);
  process.exit(1);
});
