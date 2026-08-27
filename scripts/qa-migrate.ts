/** Apply the complete Drizzle migration chain to an embedded PostgreSQL 16 database. */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  if (!migrationFiles.length) throw new Error("No Drizzle migrations were found.");

  const database = new PGlite();
  const started = performance.now();

  try {
    await database.exec("BEGIN");
    for (const file of migrationFiles) {
      const sql = await readFile(resolve(migrationDirectory, file), "utf8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) await database.exec(statement);
    }
    await database.exec("COMMIT");
  } catch (error) {
    await database.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }

  const tableResult = await database.query<{ table_name: string }>(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);
  const tableNames = new Set(tableResult.rows.map((row) => row.table_name));
  const requiredTables = [
  "site_profiles",
  "portfolio_groups",
  "site_group_memberships",
  "site_connections",
  "provider_spend",
  "detailed_crawl_runs",
  "browser_crawl_runs",
  "reliability_checks",
  "competitor_research_runs",
  "keyword_strategy_snapshots",
  "local_seo_locations",
  "link_prospects",
  "ai_response_observations",
  "portfolio_notifications",
  "access_audit_events",
  "workspace_users",
  "user_access_grants",
  "keyword_projects",
  "rank_tracking_campaigns",
  "messaging_integrations",
];
  const missing = requiredTables.filter((table) => !tableNames.has(table));
  if (missing.length) throw new Error(`Migration rehearsal is missing tables: ${missing.join(", ")}`);

  await database.exec("BEGIN; CREATE TABLE migration_rollback_probe (id integer); ROLLBACK;");
  const rollbackResult = await database.query<{ exists: boolean }>(`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'migration_rollback_probe'
  ) AS exists
`);
  if (rollbackResult.rows[0]?.exists) throw new Error("Transactional DDL rollback probe failed.");

  console.log(JSON.stringify({
    postgres: "PGlite PostgreSQL 16",
    migrationsApplied: migrationFiles.length,
    tablesCreated: tableNames.size,
    transactionalRollbackVerified: true,
    durationMs: Number((performance.now() - started).toFixed(1)),
  }, null, 2));

  await database.close();
}

void main();
