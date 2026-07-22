/**
 * Database bootstrap: `npm run db:seed`.
 *
 * Creates the organisation, admin user and domain rows from the registry —
 * REAL configuration only, no fabricated metrics. All metric data comes from
 * provider syncs (scripts/jobs.ts → src/sync/engine.ts).
 */
import { db, schema } from "../src/db";
import { DOMAINS } from "../src/data/domains";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const database = db();

  console.log("Bootstrapping organisation, admin user and domains…");
  const [org] = await database
    .insert(schema.organisations)
    .values({ name: "Orwell", monthlyBudgetUsd: 200 })
    .returning();
  if (!org) throw new Error("Failed to create organisation");

  const [admin] = await database
    .insert(schema.users)
    .values({ email: "admin@orwell.io", name: "Orwell Admin" })
    .returning();
  if (!admin) throw new Error("Failed to create user");

  await database.insert(schema.memberships).values({
    orgId: org.id,
    userId: admin.id,
    role: "admin",
  });

  for (const d of DOMAINS) {
    const [domainRow] = await database
      .insert(schema.domains)
      .values({
        orgId: org.id,
        slug: d.id,
        name: d.name,
        host: d.host,
        accent: d.accent,
        industry: d.industry,
        primaryMarket: d.primaryMarket,
      })
      .returning();
    if (!domainRow) continue;
    await database.insert(schema.domainProperties).values({
      domainId: domainRow.id,
      gscProperty: d.gscSite,
      ga4Property: d.ga4PropertyId,
      defaultLocation: d.primaryMarket,
      defaultDevice: "desktop",
    });
    console.log(`  ✓ ${d.name}`);
  }

  console.log("Bootstrap complete. Run the sync job to populate live data.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
