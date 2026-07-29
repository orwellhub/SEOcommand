/**
 * Pull canonical live data out of a deployed Orwell instance and print it to
 * stdout, so analysis can happen locally (or in an agent session) without a
 * browser login and without a hand-copied payload.
 *
 * Reads only. Hits GET /api/live/* with the API_READ_TOKEN bearer token, which
 * is scoped to snapshot reads — this script can never trigger a sync or spend
 * DataForSEO budget.
 *
 *   npm run pull -- mortgagecompare                        # list datasets
 *   npm run pull -- mortgagecompare striking_distance      # one dataset as JSON
 *   npm run pull -- mortgagecompare striking_distance --csv
 *   npm run pull -- portfolio                              # cross-domain rollup
 *
 * Environment:
 *   ORWELL_BASE_URL   deployed app root (default https://orwell-web.onrender.com)
 *   ORWELL_READ_TOKEN value of API_READ_TOKEN on that deployment
 */

const BASE_URL = (process.env.ORWELL_BASE_URL ?? "https://orwell-web.onrender.com").replace(/\/+$/, "");
const READ_TOKEN = process.env.ORWELL_READ_TOKEN;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** CSV for spreadsheet handoff. Union of keys across rows, RFC 4180 quoting. */
function toCsv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((c) => escape(row[c])).join(","))].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const csv = args.includes("--csv");
  const [domainId, dataset] = args.filter((a) => !a.startsWith("--"));

  if (!domainId) fail("Usage: npm run pull -- <domainId> [dataset] [--csv]");
  if (!READ_TOKEN) fail("ORWELL_READ_TOKEN is not set. Set it to the deployment's API_READ_TOKEN value.");

  const path = domainId === "portfolio" ? "/api/live/portfolio" : `/api/live/${domainId}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${READ_TOKEN}` },
  });

  if (response.status === 401) {
    fail("401 Unauthorized. API_READ_TOKEN is unset on the deployment, or ORWELL_READ_TOKEN does not match it.");
  }
  if (!response.ok) fail(`HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);

  const bundle = (await response.json()) as {
    lastSync?: string | null;
    datasets?: Record<string, { data?: unknown; capturedOn?: string }>;
  };
  const datasets = bundle.datasets ?? {};

  // No dataset named: show what is available and how fresh it is, rather than
  // dumping the whole bundle.
  if (!dataset) {
    process.stderr.write(`${domainId} — last sync ${bundle.lastSync ?? "never"}\n`);
    const names = Object.keys(datasets).sort();
    if (names.length === 0) fail("No datasets present. The domain has not been synced yet.");
    for (const name of names) {
      const entry = datasets[name];
      const count = Array.isArray(entry?.data) ? `${entry.data.length} rows` : "object";
      process.stdout.write(`${name.padEnd(24)} ${String(count).padEnd(12)} captured ${entry?.capturedOn ?? "?"}\n`);
    }
    return;
  }

  const entry = datasets[dataset];
  if (!entry) {
    fail(`Dataset "${dataset}" is not present for ${domainId}. Available: ${Object.keys(datasets).sort().join(", ")}`);
  }

  const data = entry.data;
  if (Array.isArray(data) && data.length === 0) {
    process.stderr.write(`Warning: "${dataset}" is present but empty (captured ${entry.capturedOn ?? "?"}).\n`);
  } else {
    process.stderr.write(
      `${dataset}: ${Array.isArray(data) ? `${data.length} rows` : "object"}, captured ${entry.capturedOn ?? "?"}\n`,
    );
  }

  if (csv) {
    if (!Array.isArray(data)) fail(`"${dataset}" is not an array, so --csv does not apply.`);
    process.stdout.write(`${toCsv(data as Record<string, unknown>[])}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
