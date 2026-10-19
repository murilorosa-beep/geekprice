import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import { inventoryItems, priceChangeBatches, priceChangeHistory } from "@/db/schema";
import { getIndexPricingPreview } from "./inventory";

export class IndexApprovalError extends Error {}

export async function approveIndexSuggestion(organizationId: string, userId: string, inventoryItemId: string,
  input: { cardId: string; confirmedVariant: boolean; expectedCurrentPrice: string }) {
  if (!input.confirmedVariant) throw new IndexApprovalError("Confirme manualmente idioma, acabamento e condição da carta.");
  const preview = await getIndexPricingPreview(organizationId, inventoryItemId);
  if (!preview) return null;
  const selected = preview.candidates.find((candidate) => candidate.card.id === input.cardId);
  if (!selected || preview.linkedCardId !== input.cardId || selected.match !== "exact" || !selected.reference)
    throw new IndexApprovalError("A impressão não está vinculada com correspondência exata. Revise a seleção.");
  const reference = selected.reference;
  const pricing = preview.pricing;
  if (!pricing?.canManuallyApprove || !Number.isFinite(pricing.suggestedPrice) || pricing.suggestedPrice < pricing.minimumPrice)
    throw new IndexApprovalError("A fonte, a data ou a margem não permitem aplicar esta referência.");
  if (Number(preview.item.cost) <= 0 || Number(preview.item.currentPrice) <= 0)
    throw new IndexApprovalError("Informe custo e preço atual positivos antes da aprovação.");
  if (Math.abs(pricing.percentageChange) > 15)
    throw new IndexApprovalError("A mudança excede 15%. Ajuste e revise o preço manualmente em Produtos.");
  const current = new Decimal(preview.item.currentPrice).toFixed(2);
  if (new Decimal(input.expectedCurrentPrice).toFixed(2) !== current)
    throw new IndexApprovalError("O preço atual mudou. Atualize a sugestão antes de aprovar.");
  const suggested = new Decimal(pricing.suggestedPrice).toFixed(2);
  if (suggested === current) throw new IndexApprovalError("O preço sugerido já é o preço atual.");
  return db.transaction(async (tx) => {
    const [item] = await tx.select({ price: inventoryItems.price, cost: inventoryItems.cost,
      quantity: inventoryItems.quantity }).from(inventoryItems).where(and(eq(inventoryItems.id, inventoryItemId),
      eq(inventoryItems.organizationId, organizationId))).limit(1);
    if (!item || item.price !== current || item.cost !== preview.item.cost)
      throw new IndexApprovalError("Preço ou custo mudou durante a aprovação. Nenhum item foi alterado.");
    const [batch] = await tx.insert(priceChangeBatches).values({ organizationId, createdById: userId,
      source: "geekprice_index_manual", channel: "counter", status: "applied", totalItems: 1,
      totalValueBefore: new Decimal(current).mul(item.quantity).toFixed(2),
      totalValueAfter: new Decimal(suggested).mul(item.quantity).toFixed(2),
      notes: JSON.stringify({ indexCardId: input.cardId, source: reference.source.name,
        sourceUrl: reference.source.url, observedAt: reference.observedAt,
        referenceValue: pricing.referenceValue, referenceKind: pricing.referenceKind,
        variantConfirmedBy: userId }),
    }).returning();
    await tx.insert(priceChangeHistory).values({ organizationId, batchId: batch.id, inventoryItemId,
      previousPrice: current, newPrice: suggested, suggestedPrice: suggested,
      minimumPrice: new Decimal(pricing.minimumPrice).toFixed(2),
      marginPercent: new Decimal(pricing.projectedMargin).toFixed(4), safetyStatus: "suspicious_flagged" });
    const updated = await tx.execute(sql`update inventory_items set price = ${suggested}::numeric, updated_at = now()
      where id = ${inventoryItemId}::uuid and organization_id = ${organizationId}::uuid
      and price = ${current}::numeric and cost = ${item.cost}::numeric returning id`);
    if (updated.length !== 1) throw new IndexApprovalError("Preço ou custo mudou durante a aprovação. Nenhum item foi alterado.");
    return { batchId: batch.id, previousPrice: current, newPrice: suggested, minimumPrice: pricing.minimumPrice };
  });
}

export async function getIndexPriceChangeHistory(organizationId: string, inventoryItemId: string) {
  return db.select({ batchId: priceChangeBatches.id, status: priceChangeBatches.status,
    appliedAt: priceChangeHistory.appliedAt, revertedAt: priceChangeBatches.revertedAt,
    previousPrice: priceChangeHistory.previousPrice, newPrice: priceChangeHistory.newPrice,
    minimumPrice: priceChangeHistory.minimumPrice, notes: priceChangeBatches.notes,
  }).from(priceChangeHistory).innerJoin(priceChangeBatches, eq(priceChangeBatches.id, priceChangeHistory.batchId))
    .where(and(eq(priceChangeHistory.organizationId, organizationId),
      eq(priceChangeHistory.inventoryItemId, inventoryItemId), eq(priceChangeBatches.source, "geekprice_index_manual")))
    .orderBy(desc(priceChangeHistory.appliedAt)).limit(20);
}
