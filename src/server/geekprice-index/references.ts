import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexCards, indexInventoryLinks, indexObservations, indexSources, inventoryItems, products, productVariants } from "@/db/schema";
import type { IndicativeMarketReference } from "@/lib/index-reference";
import { describeQuoteQuality, matchStockPrinting, normalizeCollectorNumber, parsePilotTsv, type IndexGame, type IndexQuote } from "./core";

type Connection = Pick<typeof db, "select" | "selectDistinctOn" | "insert" | "execute">;

let cachedPilot: Array<IndexQuote & { id: string }> | null = null;
export function getPilotFallbackQuotes(): Array<IndexQuote & { id: string }> {
  if (cachedPilot) return cachedPilot;
  try {
    const tsvPath = resolve(process.cwd(), "data/geekprice-index/mypcards-pilot.tsv");
    const manifestPath = resolve(process.cwd(), "data/geekprice-index/manifest.json");
    if (!existsSync(tsvPath) || !existsSync(manifestPath)) return [];
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { observed_at?: string };
    const quotes = parsePilotTsv(readFileSync(tsvPath, "utf8"), new Date(manifest.observed_at ?? "2026-10-15T21:57:41Z"));
    cachedPilot = quotes.map((quote) => {
      const hex = createHash("sha256").update(`pilot:${quote.game}:${quote.canonicalId}`).digest("hex");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      return { ...quote, id };
    });
    return cachedPilot;
  } catch {
    return [];
  }
}

export async function indexAvailable(connection: Connection = db) {
  try {
    const rows = await connection.execute(sql`select (to_regclass('public.index_inventory_links') is not null and to_regclass('public.index_cards') is not null) as available`);
    return rows[0]?.available === true;
  } catch {
    return false;
  }
}

export async function linkInventoryVariantToIndex(connection: Connection, organizationId: string, inventoryItemId: string,
  stock: { name: string; category: string; setName: string | null; collectorNumber: string | null; catalogSource?: string | null; canonicalId?: string | null }) {
  if (!await indexAvailable(connection)) return;
  const game: IndexGame | null = stock.catalogSource === "tcgdex" || /pok[eé]mon/i.test(stock.category) ? "pokemon" :
    stock.catalogSource === "scryfall" || /magic/i.test(stock.category) ? "magic" : null;
  if (!game || !stock.collectorNumber) return;
  const number = normalizeCollectorNumber(stock.collectorNumber).number;
  const candidates = await connection.select().from(indexCards).where(and(eq(indexCards.game, game),
    sql`coalesce(nullif(ltrim(upper(split_part(${indexCards.collectorNumber}, '/', 1)), '0'), ''), '0') = ${number}`));
  const exact = candidates.filter((card) => card.matchStatus === "exact" && matchStockPrinting({ ...stock, game }, card) === "exact");
  if (exact.length !== 1) return; // Ambiguity requires an explicit choice, never first-match wins.
  await connection.insert(indexInventoryLinks).values({ organizationId, inventoryItemId, cardId: exact[0].id, matchStatus: "exact" })
    .onConflictDoNothing({ target: [indexInventoryLinks.organizationId, indexInventoryLinks.inventoryItemId] });
}

export async function attachIndexReferences<T extends { id: string; marketPrice: string | number | null }>(organizationId: string, items: T[]) {
  const references = new Map<string, IndicativeMarketReference>();
  if (!items.length) {
    return items.map((item) => ({ ...item, verifiedMarketPrice: item.marketPrice == null ? null : Number(item.marketPrice), indicativeMarketReference: null }));
  }
  const available = await indexAvailable();
  if (available) {
    const itemIds = items.map((item) => item.id);
    const existingLinks = await db.select({ itemId: indexInventoryLinks.inventoryItemId })
      .from(indexInventoryLinks)
      .where(and(eq(indexInventoryLinks.organizationId, organizationId), inArray(indexInventoryLinks.inventoryItemId, itemIds)));
    const linkedSet = new Set(existingLinks.map((row) => row.itemId));
    const unlinkedIds = itemIds.filter((id) => !linkedSet.has(id));
    if (unlinkedIds.length > 0) {
      const stockRows = await db.select({
        itemId: inventoryItems.id, name: products.name, category: products.category,
        setName: productVariants.setName, collectorNumber: productVariants.collectorNumber,
        catalogSource: productVariants.catalogSource, canonicalId: productVariants.canonicalId,
      }).from(inventoryItems)
        .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(eq(inventoryItems.organizationId, organizationId), inArray(inventoryItems.id, unlinkedIds)));
      for (const stock of stockRows) {
        await linkInventoryVariantToIndex(db, organizationId, stock.itemId, stock);
      }
    }
    // One latest active BRL observation per item, regardless of observation history size.
    const rows = await db.selectDistinctOn([indexInventoryLinks.inventoryItemId], {
      itemId: indexInventoryLinks.inventoryItemId, cardId: indexCards.id, observation: indexObservations, source: indexSources,
      card: indexCards, variant: productVariants, product: products,
    }).from(indexInventoryLinks)
      .innerJoin(inventoryItems, and(eq(inventoryItems.id, indexInventoryLinks.inventoryItemId), eq(inventoryItems.organizationId, organizationId)))
      .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(indexCards, eq(indexCards.id, indexInventoryLinks.cardId))
      .innerJoin(indexObservations, and(eq(indexObservations.cardId, indexCards.id), eq(indexObservations.currency, "BRL")))
      .innerJoin(indexSources, and(eq(indexSources.id, indexObservations.sourceId), eq(indexSources.active, true)))
      .where(and(eq(indexInventoryLinks.organizationId, organizationId), eq(indexInventoryLinks.matchStatus, "exact"),
        eq(indexCards.matchStatus, "exact"), inArray(indexInventoryLinks.inventoryItemId, itemIds)))
      .orderBy(indexInventoryLinks.inventoryItemId, desc(indexObservations.lastSeenAt), desc(indexObservations.observedAt), indexObservations.id);
    for (const row of rows) {
      const game = row.variant.catalogSource === "tcgdex" || /pok[eé]mon/i.test(row.product.category) ? "pokemon" :
        row.variant.catalogSource === "scryfall" || /magic/i.test(row.product.category) ? "magic" : null;
      if (!game || matchStockPrinting({ ...row.variant, game, name: row.product.name }, row.card) !== "exact") continue;
      const o = row.observation;
      const quality = describeQuoteQuality(o.lastSeenAt, o.availableQuantity, 1, "exact");
      references.set(row.itemId, { cardId: row.cardId, price: Number(o.providerAverage ?? o.priceMin),
        source: row.source.name, sourceUrl: o.sourceUrl, observedAt: o.observedAt.toISOString(), lastSeenAt: o.lastSeenAt.toISOString(),
        confidence: quality.level, score: quality.score, stale: quality.ageDays > 30, indicativeOnly: true, autoApplyEligible: false });
    }
  } else {
    const pilot = getPilotFallbackQuotes();
    if (pilot.length > 0) {
      const stockRows = await db.select({
        itemId: inventoryItems.id, name: products.name, category: products.category,
        setName: productVariants.setName, collectorNumber: productVariants.collectorNumber,
        catalogSource: productVariants.catalogSource, canonicalId: productVariants.canonicalId,
      }).from(inventoryItems)
        .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(eq(inventoryItems.organizationId, organizationId), inArray(inventoryItems.id, items.map((item) => item.id))));
      for (const stock of stockRows) {
        const game: IndexGame | null = stock.catalogSource === "tcgdex" || /pok[eé]mon/i.test(stock.category) ? "pokemon" :
          stock.catalogSource === "scryfall" || /magic/i.test(stock.category) ? "magic" : null;
        if (!game || !stock.collectorNumber) continue;
        const exact = pilot.filter((card) => matchStockPrinting({ ...stock, game }, card) === "exact");
        if (exact.length !== 1) continue;
        const q = exact[0];
        const quality = describeQuoteQuality(q.observedAt, q.availableQuantity, 1, "exact");
        references.set(stock.itemId, {
          cardId: q.id, price: Number(q.providerAverage ?? q.priceMin),
          source: "MYP Cards", sourceUrl: q.sourceUrl, observedAt: q.observedAt.toISOString(), lastSeenAt: q.observedAt.toISOString(),
          confidence: quality.level, score: quality.score, stale: quality.ageDays > 30, indicativeOnly: true, autoApplyEligible: false,
        });
      }
    }
  }
  return items.map((item) => ({ ...item, verifiedMarketPrice: item.marketPrice == null ? null : Number(item.marketPrice),
    indicativeMarketReference: references.get(item.id) ?? null }));
}

