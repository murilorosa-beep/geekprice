import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexCards, indexInventoryLinks, inventoryItems, organizations, products, productVariants, users, recommendations } from "@/db/schema";
import { createInventoryItem, listAllInventory, listInventory, listInventoryChunk } from "@/server/inventory/service";
import { inventoryInputSchema } from "@/server/inventory/schemas";
import { getIndexPricingPreview, getInventoryIndexMatches } from "@/server/geekprice-index/inventory";
import { approveIndexSuggestion } from "@/server/geekprice-index/approval";
import { listRecommendations, refreshRecommendations } from "@/server/recommendations/service";
import { getAutopilotQueue, rollbackPriceBatch } from "@/server/autopilot/service";
import { assertIsolatedIndexDatabase } from "../../scripts/index-isolated-db";

const nonce = randomUUID();
let orgA: string, orgB: string, userId: string;
const productIds: string[] = [];
const extraCards: string[] = [];
beforeAll(async () => {
  assertIsolatedIndexDatabase();
  const target = await db.execute(sql`select current_database() as name`);
  expect(target[0].name).toBe("geekprice_index_dev");
  process.env.INDEX_ALLOW_UNAPPROVED_REFERENCE_MANUAL = "true";
  const orgs = await db.insert(organizations).values([{ name: "Index A", slug: `index-a-${nonce}` }, { name: "Index B", slug: `index-b-${nonce}` }]).returning();
  [orgA, orgB] = orgs.map((org) => org.id);
  const [user] = await db.insert(users).values({ name: "Index Test", email: `${nonce}@localhost.test`, passwordHash: "test" }).returning();
  userId = user.id;
});
afterAll(async () => {
  if (orgA) await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
  if (extraCards.length) await db.delete(indexCards).where(inArray(indexCards.id, extraCards));
});
async function create(setName: string, collectorNumber: string, overrides: Record<string, unknown> = {}, org = orgA) {
  const item = await createInventoryItem(org, inventoryInputSchema.parse({ name: "Charizard", category: "Pokémon TCG", sku: randomUUID(), setName, collectorNumber,
    language: "en", condition: "near_mint", finish: "holo", cost: "2500", price: "5000", quantity: 1, desiredMarginPercent: "25", ...overrides }));
  const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, item.variantId));
  productIds.push(variant.productId);
  return item;
}
it("registers exact printings, preserves identifiers, separates indicative prices and organizations", async () => {
  const base = await create("Base Set", "004/102");
  const base2 = await create("Base Set 2", "004/130");
  const portuguese = await create("Coleção Básica", "4", { catalogSource: "tcgdex", canonicalId: "base1-4" });
  const bolt = await create("Magic 2010", "146", { name: "Lightning Bolt", category: "Magic", catalogSource: "scryfall", canonicalId: "m10-146", cost: "5", price: "12" });
  const missing = await create("Base Set", "44", { name: "Bulbasaur" });
  const foil = await create("Base Set", "4", { finish: "reverse" });
  const other = await create("Base Set", "4", { cost: "100", price: "200" }, orgB);
  const inventory = await listAllInventory(orgA);
  const get = (id: string) => inventory.items.find((item) => item.id === id)!;
  expect(get(base.id).indicativeMarketReference?.price).toBe(5180.43);
  expect(get(base2.id).indicativeMarketReference?.price).toBe(4645);
  expect(get(portuguese.id).indicativeMarketReference?.price).toBe(5180.43);
  expect(get(bolt.id).indicativeMarketReference?.price).toBe(11.85);
  expect(get(missing.id).indicativeMarketReference).toBeNull();
  expect(get(foil.id).marketPrice).toBeNull();
  expect(inventory.items.every((item) => item.verifiedMarketPrice === null)).toBe(true);
  expect(get(other.id)).toBeUndefined();
  expect(await getIndexPricingPreview(orgB, base.id)).toBeNull();
  expect((await listAllInventory(orgB)).items[0]).toMatchObject({ cost: 100, currentPrice: 200, indicativeMarketReference: { price: 5180.43 } });
  expect((await listInventory(orgA, { q: "", availability: "all", page: 1, pageSize: 100 })).items).toHaveLength(inventory.items.length);
  expect((await listInventoryChunk(orgA, { limit: 100 })).find((item) => item.id === base.id)?.indicativeMarketReference?.price).toBe(5180.43);
  const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, portuguese.variantId));
  expect(variant.canonicalId).toBe("base1-4");
  const preview = await getIndexPricingPreview(orgA, portuguese.id);
  expect(preview?.pricing).toMatchObject({ referenceValue: "5180.43", canManuallyApprove: true, autoApplyEligible: false });
  await refreshRecommendations(orgA);
  const before = await db.select().from(recommendations).where(eq(recommendations.organizationId, orgA));
  await refreshRecommendations(orgA);
  expect(await db.select().from(recommendations).where(eq(recommendations.organizationId, orgA))).toHaveLength(before.length);
  const recommendation = (await listRecommendations(orgA)).find((item) => item.inventoryItemId === portuguese.id)!;
  expect(recommendation.suggestedPrice).toBe(preview?.pricing?.suggestedPrice);
  expect(recommendation.safetyStatus).not.toBe("safe_auto");
  const queue = await getAutopilotQueue(orgA, "counter");
  expect(queue.safe.some((item) => item.id === base.id)).toBe(false);
  const flaggedBase = queue.flagged.find((item) => item.id === base.id);
  expect(flaggedBase).toMatchObject({
    marketPrice: null,
    suggestedPrice: 5024.9,
    safetyStatus: "suspicious_flagged",
    safetyGate: "unverified_market_reference",
    indicativeMarketReference: { price: 5180.43 },
  });
  await expect(approveIndexSuggestion(orgA, userId, base.id, { cardId: preview!.linkedCardId!, confirmedVariant: false, expectedCurrentPrice: "5000" })).rejects.toThrow();
  const input = { cardId: preview!.linkedCardId!, confirmedVariant: true, expectedCurrentPrice: "5000" };
  const applied = await approveIndexSuggestion(orgA, userId, portuguese.id, input);
  expect(applied?.newPrice).toBe("5024.90");
  await expect(approveIndexSuggestion(orgA, userId, portuguese.id, input)).rejects.toThrow();
  await rollbackPriceBatch(orgA, userId, applied!.batchId);
  const [restored] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, portuguese.id));
  expect(restored.price).toBe("5000.00");
});
it("does not auto-link ambiguous identities", async () => {
  const cards = await db.insert(indexCards).values(["one", "two"].map((id) => ({ game: "pokemon", name: "Ambiguous Test", catalogSource: "fixture", canonicalId: `${nonce}-${id}`, setName: "Test Set", setCode: "test", collectorNumber: "999" }))).returning();
  extraCards.push(...cards.map((card) => card.id));
  const item = await create("Test Set", "999", { name: "Ambiguous Test" });
  expect(await db.select().from(indexInventoryLinks).where(eq(indexInventoryLinks.inventoryItemId, item.id))).toHaveLength(0);
  expect((await getInventoryIndexMatches(orgA, item.id))?.status).toBe("ambiguous");
});
