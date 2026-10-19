import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalListings, inventoryItems, priceObservations, sources } from "@/db/schema";

export type PublicMarketReference = {
  price: number;
  source: string;
  observedAt: string;
};

export async function attachPublicReferences<T extends { id: string }>(organizationId: string, items: T[]) {
  if (items.length === 0) return items.map((item) => ({ ...item, publicMarketReference: null as PublicMarketReference | null }));
  const freshSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.selectDistinctOn([inventoryItems.id], {
    itemId: inventoryItems.id,
    price: priceObservations.price,
    source: sources.name,
    observedAt: priceObservations.referenceAt,
  }).from(inventoryItems)
    .innerJoin(externalListings, eq(externalListings.variantId, inventoryItems.variantId))
    .innerJoin(sources, and(eq(sources.id, externalListings.sourceId), eq(sources.organizationId, organizationId), eq(sources.active, true), sql`${sources.config}->>'type' = 'unverified_national_reference'`))
    .innerJoin(priceObservations, and(eq(priceObservations.listingId, externalListings.id), eq(priceObservations.currency, "BRL"), eq(priceObservations.region, "BR"), eq(priceObservations.type, "reference"), eq(priceObservations.available, true), gte(priceObservations.referenceAt, freshSince)))
    .where(and(eq(inventoryItems.organizationId, organizationId), inArray(inventoryItems.id, items.map((item) => item.id))))
    .orderBy(inventoryItems.id, desc(priceObservations.referenceAt), desc(priceObservations.observedAt));
  const byId = new Map(rows.map((row) => [row.itemId, {
    price: Number(row.price), source: row.source, observedAt: row.observedAt.toISOString(),
  }]));
  return items.map((item) => ({ ...item, publicMarketReference: byId.get(item.id) ?? null }));
}
