import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Applying non-redundant performance indexes...");
  
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS alerts_org_created_idx 
    ON alerts (organization_id, created_at DESC);
  `);
  console.log("✓ alerts_org_created_idx created.");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS price_observations_market_lookup_idx 
    ON price_observations (listing_id, currency, region, available);
  `);
  console.log("✓ price_observations_market_lookup_idx created.");

  const [org] = await db.execute(sql`SELECT id FROM organizations LIMIT 1`);
  const orgId = (org as any)?.id;
  if (orgId) {
    console.log("\n=== EXPLAIN ANALYZE WITH NEW INDEX: ALERTS ===");
    const alertsExplain = await db.execute(sql`
      EXPLAIN ANALYZE
      SELECT *
      FROM alerts
      WHERE organization_id = ${orgId}
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    for (const row of alertsExplain) {
      console.log("  ", (row as any)["QUERY PLAN"]);
    }
  }

  process.exit(0);
}

main().catch(console.error);
