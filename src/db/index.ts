import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazy Postgres connection. Importing the module does not establish a network
 * connection; the client is created on the first live persistence operation.
 */
let _db: ReturnType<typeof drizzle> | null = null;

export function db() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Live snapshots, workflows and report schedules require Postgres.",
    );
  }
  const client = postgres(url, { max: 5, prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
