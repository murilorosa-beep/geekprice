import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, or, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, externalListings, inventoryItems, priceObservations, productVariants, products, sources } from "@/db/schema";
import { tcgdexConnector } from "./tcgdex";
import { scryfallConnector } from "./scryfall";

export async function linkAndCollect(organizationId: string, input: { inventoryItemId: string; externalCardId: string; language: string; externalVariantId?: string }) {
  const [owned] = await db.select({ variantId: inventoryItems.variantId, condition: productVariants.condition, finish: productVariants.finish })
    .from(inventoryItems).innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .where(and(eq(inventoryItems.id, input.inventoryItemId), eq(inventoryItems.organizationId, organizationId))).limit(1);
  if (!owned) return null;
  const card = await tcgdexConnector.getCard(input.externalCardId, input.language);
  return db.transaction(async (tx) => {
    let [source] = await tx.select().from(sources).where(and(eq(sources.organizationId, organizationId), eq(sources.kind, "tcgdex"))).limit(1);
    if (!source) [source] = await tx.insert(sources).values({ organizationId, name: "TCGdex", kind: "tcgdex", config: { region: "international" } }).returning();
    const cardKey = `${card.language}:${card.id}`;
    const [previousLink] = await tx.select({ externalId: externalListings.externalId }).from(externalListings)
      .where(and(eq(externalListings.sourceId, source.id), eq(externalListings.variantId, owned.variantId), or(eq(externalListings.externalId, cardKey), like(externalListings.externalId, `${cardKey}:%`))))
      .limit(1);
    const externalId = previousLink?.externalId ?? `${cardKey}:${owned.variantId}`;
    const [listing] = await tx.insert(externalListings).values({ sourceId: source.id, variantId: owned.variantId, externalId, externalVariantId: input.externalVariantId ?? null, metadata: { cardId: card.id, name: card.name, setId: card.setId, setName: card.setName, localId: card.localId, rarity: card.rarity, language: card.language, image: card.image } })
      .onConflictDoUpdate({ target: [externalListings.sourceId, externalListings.externalId], set: { externalVariantId: input.externalVariantId ?? null, updatedAt: new Date() } }).returning();
    if (listing.variantId !== owned.variantId) throw new Error("Conflito de vínculo: esta referência pertence a outra variante.");
    let inserted = 0;
    for (const price of card.prices.filter((value) => !input.externalVariantId || value.externalVariantId === input.externalVariantId)) {
      const [previous] = await tx.select({ price: priceObservations.price }).from(priceObservations).where(and(eq(priceObservations.listingId, listing.id), eq(priceObservations.currency, price.currency), eq(priceObservations.finish, price.finish))).orderBy(desc(priceObservations.referenceAt)).limit(1);
      const fingerprint = createHash("sha256").update([listing.id, price.externalVariantId, price.currency, price.price, price.referenceAt.toISOString()].join("|")).digest("hex");
      const rows = await tx.insert(priceObservations).values({ listingId: listing.id, price: price.price.toFixed(2), currency: price.currency, region: "international", type: "reference", condition: price.condition ?? owned.condition, finish: price.finish || owned.finish, referenceAt: price.referenceAt, fingerprint, rawPayload: price.raw }).onConflictDoNothing({ target: priceObservations.fingerprint }).returning({ id: priceObservations.id });
      inserted += rows.length;
      if (rows.length && previous && Number(previous.price) > 0) { const change = ((price.price - Number(previous.price)) / Number(previous.price)) * 100; if (Math.abs(change) >= 10) await tx.insert(alerts).values({ organizationId, inventoryItemId: input.inventoryItemId, severity: "warning", title: change < 0 ? "Queda relevante de referência" : "Aumento relevante de referência", message: `${price.sourceMarket}: ${change.toFixed(1)}% em ${price.currency} para a mesma variante.`, dedupeKey: `market:${fingerprint}` }).onConflictDoNothing(); }
    }
    return { card, listingId: listing.id, observationsInserted: inserted };
  });
}

export async function refreshLinkedMarket(organizationId: string) {
  const linked = await db.select({ inventoryItemId: inventoryItems.id, externalId: externalListings.externalId, language: productVariants.language, externalVariantId: externalListings.externalVariantId }).from(externalListings).innerJoin(sources, and(eq(sources.id, externalListings.sourceId), eq(sources.kind, "tcgdex"))).innerJoin(productVariants, eq(productVariants.id, externalListings.variantId)).innerJoin(inventoryItems, and(eq(inventoryItems.variantId, productVariants.id), eq(inventoryItems.organizationId, organizationId))).where(eq(sources.organizationId, organizationId));
  let inserted = 0; for (const item of linked) { const parts = item.externalId.split(":"); const result = await linkAndCollect(organizationId, { inventoryItemId: item.inventoryItemId, externalCardId: parts.length >= 2 ? parts[1] : item.externalId, language: parts.length >= 2 ? parts[0] : item.language, externalVariantId: item.externalVariantId ?? undefined }); inserted += result?.observationsInserted ?? 0; } return { linksProcessed: linked.length, observationsInserted: inserted };
}

export async function linkScryfallAndCollect(organizationId:string,inventoryItemId:string,externalCardId:string){
 const[owned]=await db.select({variantId:inventoryItems.variantId,condition:productVariants.condition,finish:productVariants.finish}).from(inventoryItems).innerJoin(productVariants,eq(productVariants.id,inventoryItems.variantId)).where(and(eq(inventoryItems.id,inventoryItemId),eq(inventoryItems.organizationId,organizationId))).limit(1);if(!owned)return null;const card=await scryfallConnector.getCard(externalCardId,"en");return db.transaction(async tx=>{let[source]=await tx.select().from(sources).where(and(eq(sources.organizationId,organizationId),eq(sources.kind,"scryfall"))).limit(1);if(!source)[source]=await tx.insert(sources).values({organizationId,name:"Scryfall",kind:"scryfall",config:{region:"international",game:"magic"}}).returning();const[previousLink]=await tx.select({externalId:externalListings.externalId}).from(externalListings).where(and(eq(externalListings.sourceId,source.id),eq(externalListings.variantId,owned.variantId),or(eq(externalListings.externalId,card.id),like(externalListings.externalId,`${card.id}:%`)))).limit(1);const externalId=previousLink?.externalId??`${card.id}:${owned.variantId}`;const[listing]=await tx.insert(externalListings).values({sourceId:source.id,variantId:owned.variantId,externalId,metadata:{cardId:card.id,name:card.name,setId:card.setId,setName:card.setName,localId:card.localId,rarity:card.rarity,language:card.language,image:card.image}}).onConflictDoUpdate({target:[externalListings.sourceId,externalListings.externalId],set:{updatedAt:new Date()}}).returning();if(listing.variantId!==owned.variantId)throw new Error("Conflito de vínculo: esta referência pertence a outra variante.");let inserted=0;for(const price of card.prices){const fingerprint=createHash("sha256").update([listing.id,price.externalVariantId,price.currency,price.price,price.referenceAt.toISOString().slice(0,10)].join("|")).digest("hex");const rows=await tx.insert(priceObservations).values({listingId:listing.id,price:price.price.toFixed(2),currency:price.currency,region:"international",type:"reference",condition:owned.condition,finish:price.finish||owned.finish,referenceAt:price.referenceAt,fingerprint,rawPayload:price.raw}).onConflictDoNothing({target:priceObservations.fingerprint}).returning({id:priceObservations.id});inserted+=rows.length}return{card,listingId:listing.id,observationsInserted:inserted}})
}

export async function getMarketData(organizationId: string, query: { inventoryItemId?: string; currency?: "BRL" | "USD" | "EUR"; source?: string; finish?: string; days: 7 | 30 | 90 }) {
  const since = new Date(Date.now() - query.days * 86_400_000);
  const filters = [eq(sources.organizationId, organizationId), eq(sources.active, true), eq(inventoryItems.organizationId, organizationId), gte(priceObservations.referenceAt, since)];
  if (query.inventoryItemId) filters.push(eq(inventoryItems.id, query.inventoryItemId));
  if (query.currency) filters.push(eq(priceObservations.currency, query.currency));
  if (query.source) filters.push(eq(sources.name, query.source));
  if (query.finish) filters.push(eq(priceObservations.finish, query.finish));
  const rows = await db.select({ inventoryItemId: inventoryItems.id, productName: products.name, setName: productVariants.setName, collectorNumber: productVariants.collectorNumber, variantId: productVariants.id, sourceId: sources.id, source: sources.name, sourceType: sql<string>`coalesce(${sources.config}->>'type', 'unspecified')`, sourceVerified: sql<boolean>`coalesce(${sources.config}->>'verified', 'false') = 'true'`, priceType: priceObservations.type, currency: priceObservations.currency, region: priceObservations.region, price: priceObservations.price, finish: priceObservations.finish, condition: priceObservations.condition, referenceAt: priceObservations.referenceAt, observedAt: priceObservations.observedAt })
    .from(priceObservations).innerJoin(externalListings, eq(externalListings.id, priceObservations.listingId)).innerJoin(sources, eq(sources.id, externalListings.sourceId)).innerJoin(productVariants, eq(productVariants.id, externalListings.variantId)).innerJoin(products, eq(products.id, productVariants.productId)).innerJoin(inventoryItems, and(eq(inventoryItems.variantId, productVariants.id), eq(inventoryItems.organizationId, organizationId))).where(and(...filters)).orderBy(desc(priceObservations.referenceAt)).limit(1000);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) { const key = [row.variantId, row.sourceId, row.priceType, row.currency, row.region, row.finish ?? "", row.condition ?? ""].join("|"); groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups.values()].map((items) => {
    const sorted = items.map((item) => Number(item.price)).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2); const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return { ...items[0], price: undefined, min: sorted[0], median, max: sorted.at(-1), count: items.length, lastUpdated: items[0].referenceAt, history: items.length >= 2 ? items.map((item) => ({ price: Number(item.price), referenceAt: item.referenceAt, source: item.source })).reverse() : [] };
  });
}
