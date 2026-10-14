import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('price_observations', 'alerts', 'inventory_items', 'product_variants', 'price_change_history')
    ORDER BY tablename, indexname;
  `);

  console.log("=== CURRENT POSTGRESQL INDEXES ===");
  for (const row of result) {
    const r = row as any;
    console.log(`${r.tablename.padEnd(22)} | ${r.indexname.padEnd(38)} | ${r.indexdef}`);
  }

  process.exit(0);
}

main().catch(console.error);
