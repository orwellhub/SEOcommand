import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazy Postgres connection. The demo build never touches this — it runs off the
 * seed modules — so importing this file must not require a live DB. The client
 * is only constructed when `db()` is first called (i.e. once live persistence
 * is switched on and DATABASE_URL is present).
 */
let _db: ReturnType<typeof drizzle> | null = null;

export function db() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The demo runs on seed data and does not need a " +
        "database; set DATABASE_URL only when enabling live persistence.",
    );
  }
  const client = postgres(url, { max: 5, prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
