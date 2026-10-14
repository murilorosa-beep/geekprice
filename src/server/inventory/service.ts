import "server-only";
import { and, asc, count, eq, gt, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalListings, inventoryItems, priceObservations, products, productVariants, sources, subscriptions } from "@/db/schema";
import { assertProductCapacity } from "@/server/billing/limits";
import type { z } from "zod";
import type { inventoryInputSchema, inventoryQuerySchema, inventoryUpdateSchema } from "./schemas";
import { organizationScopedSku } from "./scoped-sku";

export async function listInventory(organizationId: string, query: z.infer<typeof inventoryQuerySchema>) {
  const freshSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filters = [eq(inventoryItems.organizationId, organizationId)];
  if (query.q) filters.push(or(ilike(products.name, `%${query.q}%`), ilike(products.category, `%${query.q}%`), ilike(inventoryItems.organizationSku, `%${query.q}%`), ilike(productVariants.sku, `%${query.q}%`), ilike(productVariants.setName, `%${query.q}%`), ilike(productVariants.collectorNumber, `%${query.q}%`))!);
  if (query.category) filters.push(eq(products.category, query.category));
  if (query.availability === "in_stock") filters.push(gt(inventoryItems.quantity, 0));
  if (query.availability === "out_of_stock") filters.push(eq(inventoryItems.quantity, 0));
  const where = and(...filters);
  const market = db.select({ variantId: externalListings.variantId, marketPrice: sql<string>`avg(${priceObservations.price})`.as("market_price") })
    .from(externalListings)
    .innerJoin(sources, and(eq(sources.id, externalListings.sourceId), eq(sources.organizationId, organizationId), eq(sources.active, true)))
    .innerJoin(priceObservations, and(eq(priceObservations.listingId, externalListings.id), eq(priceObservations.available, true), eq(priceObservations.currency, "BRL"), eq(priceObservations.region, "BR"), eq(priceObservations.type, "reference"), gte(priceObservations.referenceAt, freshSince)))
    .innerJoin(inventoryItems, and(eq(inventoryItems.variantId, externalListings.variantId), eq(inventoryItems.organizationId, organizationId)))
    .groupBy(externalListings.variantId).as("market");
  const [rows, totalResult] = await Promise.all([
    db.select({ id: inventoryItems.id, name: products.name, imageUrl: products.imageUrl, category: products.category, set: productVariants.setName,
      code: productVariants.collectorNumber, sku: sql<string>`coalesce(${inventoryItems.organizationSku}, ${productVariants.sku})`, cost: inventoryItems.cost, currentPrice: inventoryItems.price,
      stock: inventoryItems.quantity, desiredMarginPercent: inventoryItems.desiredMarginPercent, marketPrice: market.marketPrice,
      language: productVariants.language, condition: productVariants.condition, finish: productVariants.finish, rarity: productVariants.rarity,
      catalogSource: productVariants.catalogSource, canonicalId: productVariants.canonicalId,
      catalogLinked: sql<boolean>`exists (select 1 from external_listings el join sources s on s.id = el.source_id where el.variant_id = ${productVariants.id} and s.organization_id = ${organizationId} and s.kind in ('tcgdex', 'scryfall'))`,
    }).from(inventoryItems).innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId)).leftJoin(market, eq(market.variantId, productVariants.id))
      .where(where).orderBy(asc(products.name)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(inventoryItems).innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId)).where(where),
  ]);
  return { items: rows.map((row) => ({ ...row, cost: Number(row.cost), currentPrice: Number(row.currentPrice), desiredMarginPercent: Number(row.desiredMarginPercent), marketPrice: row.marketPrice ? Number(row.marketPrice) : null })), total: totalResult[0]?.value ?? 0, page: query.page, pageSize: query.pageSize };
}

export async function listAllInventory(organizationId: string) {
  const freshSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = eq(inventoryItems.organizationId, organizationId);
  const market = db.select({ variantId: externalListings.variantId, marketPrice: sql<string>`avg(${priceObservations.price})`.as("market_price") })
    .from(externalListings)
    .innerJoin(sources, and(eq(sources.id, externalListings.sourceId), eq(sources.organizationId, organizationId), eq(sources.active, true)))
    .innerJoin(priceObservations, and(eq(priceObservations.listingId, externalListings.id), eq(priceObservations.available, true), eq(priceObservations.currency, "BRL"), eq(priceObservations.region, "BR"), eq(priceObservations.type, "reference"), gte(priceObservations.referenceAt, freshSince)))
    .innerJoin(inventoryItems, and(eq(inventoryItems.variantId, externalListings.variantId), eq(inventoryItems.organizationId, organizationId)))
    .groupBy(externalListings.variantId).as("market");

  const rows = await db.select({
    id: inventoryItems.id, name: products.name, imageUrl: products.imageUrl, category: products.category, set: productVariants.setName,
    code: productVariants.collectorNumber, sku: sql<string>`coalesce(${inventoryItems.organizationSku}, ${productVariants.sku})`, cost: inventoryItems.cost, currentPrice: inventoryItems.price,
    stock: inventoryItems.quantity, desiredMarginPercent: inventoryItems.desiredMarginPercent, marketPrice: market.marketPrice,
    language: productVariants.language, condition: productVariants.condition, finish: productVariants.finish, rarity: productVariants.rarity,
  }).from(inventoryItems).innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId)).leftJoin(market, eq(market.variantId, productVariants.id))
    .where(where).orderBy(asc(products.name));

  const items = rows.map((row) => ({
    ...row,
    cost: Number(row.cost),
    currentPrice: Number(row.currentPrice),
    desiredMarginPercent: Number(row.desiredMarginPercent),
    marketPrice: row.marketPrice ? Number(row.marketPrice) : null,
  }));

  return { items, total: items.length, page: 1, pageSize: items.length };
}

export async function listInventoryChunk(
  organizationId: string,
  options: { limit: number; offset?: number; afterId?: string | null }
) {
  const freshSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = and(eq(inventoryItems.organizationId, organizationId),
    options.afterId ? gt(inventoryItems.id, options.afterId) : undefined);
  const market = db
    .select({
      variantId: externalListings.variantId,
      marketPrice: sql<string>`avg(${priceObservations.price})`.as("market_price"),
    })
    .from(externalListings)
    .innerJoin(
      sources,
      and(eq(sources.id, externalListings.sourceId), eq(sources.organizationId, organizationId), eq(sources.active, true))
    )
    .innerJoin(
      priceObservations,
      and(
        eq(priceObservations.listingId, externalListings.id),
        eq(priceObservations.available, true),
        eq(priceObservations.currency, "BRL"),
        eq(priceObservations.region, "BR"),
        eq(priceObservations.type, "reference"),
        gte(priceObservations.referenceAt, freshSince)
      )
    )
    .innerJoin(
      inventoryItems,
      and(eq(inventoryItems.variantId, externalListings.variantId), eq(inventoryItems.organizationId, organizationId))
    )
    .groupBy(externalListings.variantId)
    .as("market");

  const rows = await db
    .select({
      id: inventoryItems.id,
      name: products.name,
      category: products.category,
      set: productVariants.setName,
      code: productVariants.collectorNumber,
      sku: sql<string>`coalesce(${inventoryItems.organizationSku}, ${productVariants.sku})`,
      cost: inventoryItems.cost,
      currentPrice: inventoryItems.price,
      stock: inventoryItems.quantity,
      desiredMarginPercent: inventoryItems.desiredMarginPercent,
      marketPrice: market.marketPrice,
      language: productVariants.language,
      condition: productVariants.condition,
      finish: productVariants.finish,
      rarity: productVariants.rarity,
    })
    .from(inventoryItems)
    .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(market, eq(market.variantId, productVariants.id))
    .where(where)
    .orderBy(asc(inventoryItems.id))
    .limit(options.limit)
    .offset(options.offset ?? 0);

  return rows.map((row) => ({
    ...row,
    cost: Number(row.cost),
    currentPrice: Number(row.currentPrice),
    desiredMarginPercent: Number(row.desiredMarginPercent),
    marketPrice: row.marketPrice ? Number(row.marketPrice) : null,
  }));
}

export async function createInventoryItem(organizationId: string, input: z.infer<typeof inventoryInputSchema>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);
    const [existingOrgItem] = await tx
      .select({ id: inventoryItems.id, variantId: inventoryItems.variantId })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.organizationId, organizationId),
        eq(inventoryItems.organizationSku, input.sku),
      ))
      .limit(1);

    let variantId = existingOrgItem?.variantId;
    if (!variantId) {
      const orgScopedSku = organizationScopedSku(organizationId, input.sku);
      const [existingScopedVariant] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.sku, orgScopedSku))
        .limit(1);

      if (existingScopedVariant) {
        variantId = existingScopedVariant.id;
      } else {
        const [product] = await tx
          .insert(products)
          .values({ name: input.name, category: input.category })
          .returning({ id: products.id });

        const [variant] = await tx
          .insert(productVariants)
          .values({
            productId: product.id,
            sku: orgScopedSku,
            setName: input.setName || null,
            collectorNumber: input.collectorNumber || null,
            language: input.language,
            condition: input.condition,
            finish: input.finish,
          })
          .returning({ id: productVariants.id });

        variantId = variant.id;
      }
    }

    const [existingItem] = await tx
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.organizationId, organizationId),
        eq(inventoryItems.variantId, variantId),
      ))
      .limit(1);

    if (!existingItem) await assertProductCapacity(tx, organizationId);

    const [item] = await tx
      .insert(inventoryItems)
      .values({
        organizationId,
        variantId,
        organizationSku: input.sku,
        cost: input.cost,
        price: input.price,
        quantity: input.quantity,
        desiredMarginPercent: input.desiredMarginPercent,
      })
      .onConflictDoUpdate({
        target: [inventoryItems.organizationId, inventoryItems.variantId],
        set: {
          organizationSku: input.sku,
          cost: input.cost,
          price: input.price,
          quantity: input.quantity,
          desiredMarginPercent: input.desiredMarginPercent,
          updatedAt: new Date(),
        },
      })
      .returning();

    return item;
  });
}

export async function createInventoryBatch(
  organizationId: string,
  items: z.infer<typeof inventoryInputSchema>[]
) {
  if (items.length === 0) return { inserted: 0 };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);
    const dedupedByOrgSku = new Map<string, (typeof items)[0]>();
    for (const item of items) {
      dedupedByOrgSku.set(item.sku, item);
    }
    const uniqueBatchItems = Array.from(dedupedByOrgSku.values());

    const orgSkus = uniqueBatchItems.map((i) => i.sku);
    const existingOrgInventory = await tx
      .select({ variantId: inventoryItems.variantId, organizationSku: inventoryItems.organizationSku })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.organizationId, organizationId),
          inArray(inventoryItems.organizationSku, orgSkus)
        )
      );

    const variantByOrgSku = new Map<string, string>();
    for (const existing of existingOrgInventory) {
      if (existing.organizationSku) {
        variantByOrgSku.set(existing.organizationSku, existing.variantId);
      }
    }

    const unmappedItems = uniqueBatchItems.filter((i) => !variantByOrgSku.has(i.sku));
    if (unmappedItems.length > 0) {
      const orgScopedSkus = unmappedItems.map((i) => organizationScopedSku(organizationId, i.sku));
      const existingVariants = await tx
        .select({ id: productVariants.id, sku: productVariants.sku })
        .from(productVariants)
        .where(inArray(productVariants.sku, orgScopedSkus));

      const scopedVariantMap = new Map<string, string>(existingVariants.map((v) => [v.sku, v.id]));

      for (const item of unmappedItems) {
        const scopedSku = organizationScopedSku(organizationId, item.sku);
        let vId = scopedVariantMap.get(scopedSku);
        if (!vId) {
          const [product] = await tx
            .insert(products)
            .values({ name: item.name, category: item.category })
            .returning({ id: products.id });
          const [variant] = await tx
            .insert(productVariants)
            .values({
              productId: product.id,
              sku: scopedSku,
              setName: item.setName || null,
              collectorNumber: item.collectorNumber || null,
              language: item.language,
              condition: item.condition,
              finish: item.finish,
            })
            .returning({ id: productVariants.id });
          vId = variant.id;
          scopedVariantMap.set(scopedSku, vId);
        }
        variantByOrgSku.set(item.sku, vId);
      }
    }

    const dedupedItems = new Map<string, (typeof items)[0]>();
    for (const item of uniqueBatchItems) {
      const vId = variantByOrgSku.get(item.sku);
      if (vId) dedupedItems.set(vId, item);
    }

    const variantIds = Array.from(dedupedItems.keys());
    const existingInventory = await tx
      .select({ variantId: inventoryItems.variantId })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.organizationId, organizationId),
          inArray(inventoryItems.variantId, variantIds)
        )
      );

    const existingVariantSet = new Set(existingInventory.map((e) => e.variantId));
    const newItemsCount = variantIds.filter((vId) => !existingVariantSet.has(vId)).length;

    if (newItemsCount > 0) {
      const [[usage], [subscription]] = await Promise.all([
        tx
          .select({ value: count() })
          .from(inventoryItems)
          .where(eq(inventoryItems.organizationId, organizationId)),
        tx
          .select({ productLimit: subscriptions.productLimit })
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, organizationId))
          .limit(1),
      ]);
      const limit = subscription?.productLimit ?? 500;
      if ((usage?.value ?? 0) + newItemsCount > limit) {
        throw new Error(`A importação excede o limite de ${limit} produtos do plano.`);
      }
    }

    const inventoryRows = Array.from(dedupedItems.entries()).map(([variantId, item]) => ({
      organizationId,
      variantId,
      organizationSku: item.sku,
      cost: item.cost,
      price: item.price,
      quantity: item.quantity,
      desiredMarginPercent: item.desiredMarginPercent,
      updatedAt: new Date(),
    }));

    const CHUNK_SIZE = 250;
    for (let i = 0; i < inventoryRows.length; i += CHUNK_SIZE) {
      const chunk = inventoryRows.slice(i, i + CHUNK_SIZE);
      await tx
        .insert(inventoryItems)
        .values(chunk)
        .onConflictDoUpdate({
          target: [inventoryItems.organizationId, inventoryItems.variantId],
          set: {
            organizationSku: sql`excluded.organization_sku`,
            cost: sql`excluded.cost`,
            price: sql`excluded.price`,
            quantity: sql`excluded.quantity`,
            desiredMarginPercent: sql`excluded.desired_margin_percent`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    return { inserted: inventoryRows.length };
  });
}

export async function updateInventoryItem(organizationId: string, id: string, input: z.infer<typeof inventoryUpdateSchema>) {
  const [item] = await db.update(inventoryItems).set({ ...input, updatedAt: new Date() }).where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, organizationId))).returning();
  return item ?? null;
}

export async function deleteInventoryItem(organizationId: string, id: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx.delete(inventoryItems).where(and(eq(inventoryItems.id, id), eq(inventoryItems.organizationId, organizationId))).returning({ id: inventoryItems.id, variantId: inventoryItems.variantId });
    if (!item) return null;
    const [variant] = await tx.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, item.variantId)).limit(1);
    const [usage] = await tx.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.variantId, item.variantId));
    if ((usage?.value ?? 0) === 0 && variant) {
      await tx.delete(productVariants).where(eq(productVariants.id, item.variantId));
      const [remainingVariants] = await tx.select({ value: count() }).from(productVariants).where(eq(productVariants.productId, variant.productId));
      if ((remainingVariants?.value ?? 0) === 0) await tx.delete(products).where(eq(products.id, variant.productId));
    }
    return { id: item.id };
  });
}
