import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazy Postgres connection. Importing the module does not establish a network
 * connection; the client is created on the first live persistence operation.
 */
let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function db() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Live snapshots, workflows and report schedules require Postgres.",
    );
  }
  _client = postgres(url, { max: 5, prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

/**
 * Close the pool so a short-lived process can exit.
 *
 * The connection pool holds open sockets, which keep Node's event loop alive
 * indefinitely. In the web service that is correct — the process is long-lived.
 * In the cron job it is not: the sync finished its work in ~45s but the
 * container then sat idle for ~58 minutes until the platform reaped it, because
 * nothing ever released these handles. Long-running services should not call
 * this; one-shot scripts must.
 */
export async function closeDb(): Promise<void> {
  if (!_client) return;
  const client = _client;
  _client = null;
  _db = null;
  await client.end({ timeout: 5 });
}

export { schema };
