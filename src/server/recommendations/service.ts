import "server-only";
import type { IndicativeMarketReference } from "@/lib/index-reference";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recommendations } from "@/db/schema";
import { calculateRecommendation } from "@/lib/pricing";
import { listAllInventory } from "@/server/inventory/service";
import { getActivePricingPolicy } from "@/server/settings/service";

export type RecommendationView = {
  id: string;
  inventoryItemId: string;
  name: string;
  sku: string;
  category: string;
  cost: number;
  currentPrice: number;
  marketPrice: number | null;
  indicativeMarketReference: IndicativeMarketReference | null;
  minimumPrice: number;
  suggestedPrice: number;
  estimatedMargin: number;
  difference: number;
  priority: number;
  status: "indicative_reference" | "below_minimum" | "below_market" | "above_market" | "no_market" | "competitive";
  safetyStatus: "safe_auto" | "suspicious_flagged" | "unchanged";
  safetyFlag: string | null;
  channel: "counter" | "ecommerce" | "marketplace";
  roundingMode: string;
  explanation: string;
  createdAt: Date;
};

async function latestByItem(organizationId: string) {
  const rows = await db
    .selectDistinctOn([recommendations.inventoryItemId])
    .from(recommendations)
    .where(eq(recommendations.organizationId, organizationId))
    .orderBy(recommendations.inventoryItemId, desc(recommendations.createdAt));
  return new Map(rows.map((row) => [row.inventoryItemId, row]));
}

export async function refreshRecommendations(organizationId: string) {
  const [inventory, policy, latest] = await Promise.all([
    listAllInventory(organizationId),
    getActivePricingPolicy(organizationId),
    latestByItem(organizationId),
  ]);
  const effective = policy ?? {
    feePercent: 12,
    additionalCostPercent: 0,
    minimumMarginPercent: 20,
    desiredMarginPercent: 25,
    marketDiscountPercent: 3,
  };
  const pending: (typeof recommendations.$inferInsert)[] = [];

  for (const item of inventory.items) {
    const isPocket = Boolean(item.imageUrl?.includes("/tcgp/"));
    const desiredMargin = Math.max(
      item.desiredMarginPercent,
      effective.minimumMarginPercent,
      effective.desiredMarginPercent
    );
    const parameters = {
      cost: item.cost,
      feesPercent: effective.feePercent,
      additionalCostsPercent: effective.additionalCostPercent,
      desiredMarginPercent: desiredMargin,
      minimumMarginPercent: effective.minimumMarginPercent,
      marketDiscountPercent: effective.marketDiscountPercent,
      marketPrice: isPocket ? null : item.marketPrice ?? (item.indicativeMarketReference?.stale ? null : item.indicativeMarketReference?.price) ?? item.publicMarketReference?.price ?? null,
      hasUnverifiedMarketReference: Boolean(item.hasUnverifiedReference || item.indicativeMarketReference || item.publicMarketReference),
      unsupportedPocketMarket: isPocket,
      currentPrice: item.currentPrice,
      maxChangePercent: 15,
      roundingMode: "ends_90" as const,

    };
    const result = calculateRecommendation(parameters);
    const inputHash = createHash("sha256").update(JSON.stringify(parameters)).digest("hex");
    if (latest.get(item.id)?.inputHash === inputHash) continue;

    pending.push({
      organizationId,
      inventoryItemId: item.id,
      channel: "counter",
      suggestedPrice: result.suggestedPrice.toFixed(2),
      minimumPrice: result.minimumPrice.toFixed(2),
      marketPrice: parameters.marketPrice?.toFixed(2) ?? null,
      safetyStatus: result.safetyStatus,
      safetyFlag: result.safetyFlag,
      roundingMode: "ends_90",
      inputHash,
      explanation: { ...parameters, projectedMargin: result.projectedMargin, gate: result.safetyGate },
    });
  }

  if (pending.length) await db.insert(recommendations).values(pending);
}

export async function listRecommendations(organizationId: string): Promise<RecommendationView[]> {
  const [inventory, policy, latest] = await Promise.all([
    listAllInventory(organizationId),
    getActivePricingPolicy(organizationId),
    latestByItem(organizationId),
  ]);
  const effective = policy ?? {
    feePercent: 12,
    additionalCostPercent: 0,
    minimumMarginPercent: 20,
    desiredMarginPercent: 25,
    marketDiscountPercent: 3,
  };

  return inventory.items.map((item) => {
    const isPocket = Boolean(item.imageUrl?.includes("/tcgp/"));
    const desiredMargin = Math.max(
      item.desiredMarginPercent,
      effective.minimumMarginPercent,
      effective.desiredMarginPercent
    );
    const calculated = calculateRecommendation({
      cost: item.cost,
      feesPercent: effective.feePercent,
      additionalCostsPercent: effective.additionalCostPercent,
      desiredMarginPercent: desiredMargin,
      minimumMarginPercent: effective.minimumMarginPercent,
      marketDiscountPercent: effective.marketDiscountPercent,
      marketPrice: isPocket ? null : item.marketPrice ?? (item.indicativeMarketReference?.stale ? null : item.indicativeMarketReference?.price) ?? item.publicMarketReference?.price ?? null,
      hasUnverifiedMarketReference: Boolean(item.hasUnverifiedReference || item.indicativeMarketReference || item.publicMarketReference),
      unsupportedPocketMarket: isPocket,
      currentPrice: item.currentPrice,
      maxChangePercent: 15,
      roundingMode: "ends_90",
    });
    const row = latest.get(item.id);
    const minimumPrice = calculated.minimumPrice;
    const suggestedPrice = calculated.suggestedPrice;
    const difference = calculated.priceDifference;
    const status: RecommendationView["status"] =
      isPocket ? "no_market" : item.currentPrice < minimumPrice
        ? "below_minimum"
        : item.indicativeMarketReference && !item.marketPrice
          ? "indicative_reference"
        : item.marketPrice == null
          ? "no_market"
          : item.currentPrice < item.marketPrice * 0.95
            ? "below_market"
            : item.currentPrice > item.marketPrice * 1.05
              ? "above_market"
              : "competitive";
    const priority =
      calculated.safetyStatus === "suspicious_flagged"
        ? 5
        : status === "below_minimum"
          ? 4
          : status === "below_market"
            ? 3
            : 1;

    return {
      id: row?.id ?? `preview:${item.id}`,
      inventoryItemId: item.id,
      name: item.name,
      sku: item.sku,
      category: item.category,
      cost: item.cost,
      currentPrice: item.currentPrice,
      marketPrice: isPocket ? null : item.marketPrice,
      indicativeMarketReference: isPocket ? null : item.indicativeMarketReference,
      minimumPrice,
      suggestedPrice,
      estimatedMargin: calculated.projectedMargin,
      difference,
      priority,
      status,
      safetyStatus: calculated.safetyStatus,
      safetyFlag: calculated.safetyFlag,
      channel: "counter",
      roundingMode: "ends_90",
      explanation: !isPocket && item.indicativeMarketReference ? "Referência indicativa do GeekPrice Index: condição, idioma e acabamento podem diferir; exige revisão e aprovação individual. " + calculated.safetyReason : calculated.safetyReason,
      createdAt: row?.createdAt ?? new Date(0),
    };
  });
}
