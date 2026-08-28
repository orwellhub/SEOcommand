import { closeDb } from "../src/db";
import { activateMortgageCompareCohort } from "../src/platform/mortgagecompare-activation";

async function main() {
  if (process.env.QA_SYNTHETIC === "true") {
    console.log("[mortgagecompare-activation] skipped synthetic QA environment");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for MortgageCompare activation.");
  const results = await activateMortgageCompareCohort();
  const created = results.filter((result) => result.created).length;
  console.log(`[mortgagecompare-activation] created=${created} existing=${results.length - created}`);
}

main()
  .then(async () => { await closeDb(); process.exit(0); })
  .catch(async (error) => {
    console.error("[mortgagecompare-activation] failed:", error);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
