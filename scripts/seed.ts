/**
 * Database seed (live persistence bootstrap): `npm run db:seed`.
 *
 * The demo UI does NOT need this — it renders from src/data seed modules. This
 * script exists to prove the schema + migrations work from a clean database and
 * to bootstrap an org, users, domains and keyword rows when live persistence is
 * switched on. It requires DATABASE_URL and applied migrations.
 */
import { db, schema } from "../src/db";
import { DOMAINS } from "../src/data/domains";
import { SEED } from "../src/data/seed";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. The demo runs without a database; set it to seed live persistence.");
    process.exit(1);
  }
  const database = db();

  console.log("Seeding organisation, users and domains…");
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
      defaultLocation: d.primaryMarket,
      defaultDevice: "desktop",
    });

    const kws = SEED.keywords[d.id];
    if (kws.length) {
      await database.insert(schema.keywords).values(
        kws.map((k) => ({
          domainId: domainRow.id,
          keyword: k.keyword,
          location: k.location,
          intent: k.intent,
          volume: k.volume,
          difficulty: k.difficulty,
          cpc: k.cpc,
          competition: k.competition,
        })),
      );
    }
    console.log(`  ✓ ${d.name}: ${kws.length} keywords`);
  }

  // Provider connections start disconnected (demo posture).
  await database.insert(schema.providerConnections).values(
    SEED.providerConnections.map((c) => ({
      orgId: org.id,
      provider: c.provider,
      connected: false,
      status: "disconnected",
    })),
  );

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
