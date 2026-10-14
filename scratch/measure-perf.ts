import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { organizations, inventoryItems, productVariants, products, externalListings, priceObservations } from "../src/db/schema";
import { eq, and, asc } from "drizzle-orm";

async function run() {
  console.log("=== Performance Diagnostics Benchmark ===");
  
  // 1. Raw DB ping
  const t0 = performance.now();
  await db.execute(sql`SELECT 1`);
  const t1 = performance.now();
  console.log(`[DB Ping] Latency: ${(t1 - t0).toFixed(2)} ms`);

  // 2. Organization fetch
  const t2 = performance.now();
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).limit(5);
  const t3 = performance.now();
  console.log(`[DB Organizations] Found ${orgs.length} orgs in ${(t3 - t2).toFixed(2)} ms`);

  if (orgs.length > 0) {
    const orgId = orgs[0].id;
    console.log(`Testing with Organization: ${orgs[0].name} (${orgId})`);

    // 3. Inventory count
    const t4 = performance.now();
    const countRes = await db.execute(sql`SELECT count(*)::int as total FROM inventory_items WHERE organization_id = ${orgId}`);
    const t5 = performance.now();
    const totalItems = (countRes[0] as any)?.total ?? 0;
    console.log(`[Inventory Count] Total: ${totalItems} items in ${(t5 - t4).toFixed(2)} ms`);

    // 4. listAllInventory query equivalent (Market subquery + 3-way join)
    const t6 = performance.now();
    const market = db.select({ variantId: externalListings.variantId, marketPrice: sql<string>`avg(${priceObservations.price})`.as("market_price") })
      .from(externalListings)
      .innerJoin(priceObservations, and(eq(priceObservations.listingId, externalListings.id), eq(priceObservations.available, true), eq(priceObservations.currency, "BRL"), eq(priceObservations.region, "BR")))
      .innerJoin(inventoryItems, and(eq(inventoryItems.variantId, externalListings.variantId), eq(inventoryItems.organizationId, orgId)))
      .groupBy(externalListings.variantId).as("market");

    const rows = await db.select({
      id: inventoryItems.id, name: products.name, category: products.category, set: productVariants.setName,
      cost: inventoryItems.cost, currentPrice: inventoryItems.price, stock: inventoryItems.quantity,
      marketPrice: market.marketPrice,
    }).from(inventoryItems).innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId)).leftJoin(market, eq(market.variantId, productVariants.id))
      .where(eq(inventoryItems.organizationId, orgId)).orderBy(asc(products.name));
    const t7 = performance.now();
    console.log(`[listAllInventory SQL Join] Returned ${rows.length} items in ${(t7 - t6).toFixed(2)} ms`);

    // 5. Query execution explain plan
    const t8 = performance.now();
    const explainResult = await db.execute(sql`
      EXPLAIN ANALYZE
      SELECT i.id, p.name, i.cost, i.price
      FROM inventory_items i
      JOIN product_variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE i.organization_id = ${orgId}
      ORDER BY p.name ASC
      LIMIT 25;
    `);
    const t9 = performance.now();
    console.log(`[EXPLAIN ANALYZE Inventory Query] Execution time: ${(t9 - t8).toFixed(2)} ms`);
    for (const row of explainResult) {
      console.log("  ", (row as any)["QUERY PLAN"]);
    }
  }

  // 6. Memory usage
  const mem = process.memoryUsage();
  console.log("=== Node.js Process Memory ===");
  console.log(`  RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  External: ${(mem.external / 1024 / 1024).toFixed(2)} MB`);

  process.exit(0);
}

run().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
