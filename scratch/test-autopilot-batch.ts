import { db } from "../src/db";
import { sql, eq } from "drizzle-orm";
import { inventoryItems, organizations, priceChangeBatches, priceChangeHistory } from "../src/db/schema";
import { applyPriceBatch, rollbackPriceBatch, AutopilotConflictError } from "../src/server/autopilot/service";

async function main() {
  console.log("=== Testing Autopilot Batch Execution ===");
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    console.log("No organization.");
    process.exit(0);
  }
  console.log("Using org:", org.name, org.id);

  // Check if there are inventory items to test
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.organizationId, org.id)).limit(2);
  console.log(`Found ${items.length} inventory items.`);

  process.exit(0);
}

main().catch(console.error);
