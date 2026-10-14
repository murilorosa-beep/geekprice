import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  const [org] = await db.execute(sql`SELECT id FROM organizations LIMIT 1`);
  const orgId = (org as any)?.id;
  if (!orgId) {
    console.log("No organization found.");
    process.exit(0);
  }

  console.log("=== EXPLAIN ANALYZE: ALERTS DASHBOARD QUERY ===");
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

  console.log("\n=== EXPLAIN ANALYZE: MARKET OBSERVATIONS AGGREGATION ===");
  const marketExplain = await db.execute(sql`
    EXPLAIN ANALYZE
    SELECT el.variant_id, avg(po.price) as market_price
    FROM external_listings el
    INNER JOIN price_observations po ON po.listing_id = el.id
      AND po.available = true
      AND po.currency = 'BRL'
      AND po.region = 'BR'
    INNER JOIN inventory_items ii ON ii.variant_id = el.variant_id
      AND ii.organization_id = ${orgId}
    GROUP BY el.variant_id;
  `);
  for (const row of marketExplain) {
    console.log("  ", (row as any)["QUERY PLAN"]);
  }

  process.exit(0);
}

main().catch(console.error);
