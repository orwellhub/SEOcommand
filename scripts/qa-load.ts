/**
 * Credential-free read-load harness for the isolated QA service.
 * Run the app with QA_SYNTHETIC=true and QA_SITE_COUNT=20 or 300 first.
 */

const baseUrl = (process.env.QA_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const concurrency = Math.min(Math.max(Number(process.env.QA_CONCURRENCY ?? "12"), 1), 50);
const requestsPerRoute = Math.min(Math.max(Number(process.env.QA_REQUESTS_PER_ROUTE ?? "80"), 1), 1000);
const routes = [
  "/api/healthz",
  "/api/live/portfolio",
  "/api/action-centre",
  "/api/sites",
  "/api/ai-visibility?scope=portfolio",
  "/portfolio",
];

type Sample = { route: string; status: number; durationMs: number; bytes: number };

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]!;
}

async function sample(route: string): Promise<Sample> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
  const body = await response.arrayBuffer();
  return {
    route,
    status: response.status,
    durationMs: performance.now() - started,
    bytes: body.byteLength,
  };
}

async function runRoute(route: string) {
  const samples: Sample[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < requestsPerRoute) {
      cursor += 1;
      samples.push(await sample(route));
    }
  }));
  const durations = samples.map((item) => item.durationMs);
  const failures = samples.filter((item) => item.status < 200 || item.status >= 400);
  return {
    route,
    requests: samples.length,
    failures: failures.length,
    statuses: [...new Set(samples.map((item) => item.status))],
    p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
    maxMs: Number(Math.max(...durations).toFixed(1)),
    averageBytes: Math.round(samples.reduce((sum, item) => sum + item.bytes, 0) / Math.max(samples.length, 1)),
  };
}

async function main() {
  const results = [];
  for (const route of routes) results.push(await runRoute(route));
  console.log(JSON.stringify({ baseUrl, concurrency, requestsPerRoute, results }, null, 2));
  if (results.some((result) => result.failures > 0)) process.exitCode = 1;
}

void main();
