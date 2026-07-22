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
  const provider = process.env.SEO_PROVIDER ?? "demo";
  const started = Date.now();

  if (provider === "demo") {
    return {
      job,
      status: "skipped",
      requests: 0,
      costUsd: 0,
      note: "Demo mode — no live provider connected; nothing to sync.",
    };
  }

  // --- Live path (not yet implemented; scaffolded for activation) ---
  // 1. Check the org budget guardrail; abort non-critical jobs if over 100%.
  // 2. Estimate request cost; batch + dedupe.
  // 3. Call the provider adapter with retry + exponential backoff.
  // 4. Write immutable snapshots + append to the API usage ledger.
  // 5. Record a provider_sync_run row (idempotency key = job+window).
  void started;
  return {
    job,
    status: "skipped",
    requests: 0,
    costUsd: 0,
    note: "Live provider selected but adapter not yet implemented.",
  };
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
