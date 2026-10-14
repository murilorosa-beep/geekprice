import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  externalListings,
  inventoryItems,
  priceObservations,
  productVariants,
  products,
  sources,
} from "@/db/schema";

export async function persistBrazilianQuoteForInventoryItem(
  organizationId: string,
  inventoryItemId: string,
  quote: {
    sourceLabel: string;
    price: number;
    url?: string;
    edition?: string;
    collectorNumber?: string;
    cardTitle?: string;
  }
) {
  if (!quote.price || quote.price <= 0) {
    throw new Error("O preço da cotação deve ser maior que zero.");
  }

  return db.transaction(async (tx) => {
    // 1. Localizar item do estoque e sua variante
    const [item] = await tx
      .select({
        id: inventoryItems.id,
        variantId: inventoryItems.variantId,
        cost: inventoryItems.cost,
        currentPrice: inventoryItems.price,
        productName: products.name,
        setName: productVariants.setName,
        sku: inventoryItems.organizationSku,
      })
      .from(inventoryItems)
      .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.organizationId, organizationId)))
      .limit(1);

    if (!item) {
      throw new Error("Item do estoque não encontrado para esta organização.");
    }

    // 2. Obter ou criar a fonte de mercado brasileira para a organização
    const sourceName = quote.sourceLabel || "Liga Pokémon";
    const [existingSource] = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.organizationId, organizationId),
          eq(sources.name, sourceName),
          eq(sources.kind, "partner_csv")
        )
      )
      .limit(1);

    let sourceId: string;
    if (existingSource) {
      sourceId = existingSource.id;
    } else {
      const [newSource] = await tx
        .insert(sources)
        .values({
          organizationId,
          name: sourceName,
          kind: "partner_csv",
          active: true,
          config: {
            region: "BR",
            currency: "BRL",
            type: "private",
            verified: false,
          },
        })
        .returning({ id: sources.id });
      sourceId = newSource.id;
    }

    // 3. Obter ou criar o external listing correspondente
    const sourceSlug = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const externalKey = `br-quote:${item.variantId}:${sourceSlug}`.slice(0, 240);

    const [listing] = await tx
      .insert(externalListings)
      .values({
        sourceId,
        variantId: item.variantId,
        externalId: externalKey,
        url: quote.url || null,
        sellerName: sourceName,
        metadata: {
          sourceName,
          edition: quote.edition,
          collectorNumber: quote.collectorNumber,
          trust: "national_quote",
          importedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [externalListings.sourceId, externalListings.externalId],
        set: {
          url: quote.url || null,
          sellerName: sourceName,
          updatedAt: new Date(),
        },
      })
      .returning({ id: externalListings.id });

    // 4. Inserir a observação de preço em BRL
    const now = new Date();
    const fingerprint = createHash("sha256")
      .update(`${item.variantId}:${sourceId}:${quote.price.toFixed(2)}:${now.toISOString().slice(0, 10)}`)
      .digest("hex");

    const [observation] = await tx
      .insert(priceObservations)
      .values({
        listingId: listing.id,
        price: quote.price.toFixed(2),
        currency: "BRL",
        region: "BR",
        type: "reference",
        available: true,
        referenceAt: now,
        fingerprint,
      })
      .onConflictDoNothing({ target: priceObservations.fingerprint })
      .returning();

    // 5. Se o preço de venda estiver muito distante da cotação de mercado, emite um alerta
    const currentPriceNum = Number(item.currentPrice);
    if (currentPriceNum > 0) {
      const diffPercent = ((currentPriceNum - quote.price) / quote.price) * 100;
      if (Math.abs(diffPercent) >= 20) {
        await tx.insert(alerts).values({
          organizationId,
          title: `Cotação BR para ${item.productName}`,
          message: `Nova cotação nacional (${sourceName}) registrada a R$ ${quote.price.toFixed(2)}. Seu preço atual é R$ ${currentPriceNum.toFixed(2)} (${diffPercent > 0 ? "+" : ""}${diffPercent.toFixed(1)}%). O Autopilot recalculará as sugestões.`,
          severity: diffPercent < -15 ? "warning" : "info",
        });
      }
    }

    return {
      success: true,
      observationId: observation?.id ?? "existing",
      productName: item.productName,
      priceRecorded: quote.price,
      currency: "BRL",
      sourceName,
    };
  });
}
