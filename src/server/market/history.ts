import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  externalListings,
  inventoryItems,
  priceChangeHistory,
  priceObservations,
  productVariants,
  sources,
} from "@/db/schema";

export type PriceHistoryPoint = {
  date: string;
  displayDate: string;
  marketPrice: number | null;
  storePrice: number | null;
};

export type PriceHistorySummary = {
  minPrice: number;
  maxPrice: number;
  avgMarketPrice: number;
  percentageChange: number;
  totalObservations: number;
};

export type PriceHistoryResult = {
  hasData: boolean;
  days: number;
  points: PriceHistoryPoint[];
  summary: PriceHistorySummary | null;
};

export async function getOrganizationMarketHistory(
  organizationId: string,
  days: number = 30
): Promise<PriceHistoryResult> {
  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const sinceDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  // 1. Obter médias diárias reais de observações de mercado em BRL
  const marketRows = await db
    .select({
      day: sql<string>`to_char(${priceObservations.referenceAt}, 'YYYY-MM-DD')`.as("day"),
      avgPrice: sql<string>`avg(${priceObservations.price})`.as("avg_price"),
      minPrice: sql<string>`min(${priceObservations.price})`.as("min_price"),
      maxPrice: sql<string>`max(${priceObservations.price})`.as("max_price"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(priceObservations)
    .innerJoin(externalListings, eq(externalListings.id, priceObservations.listingId))
    .innerJoin(sources, and(eq(sources.id, externalListings.sourceId), eq(sources.organizationId, organizationId), eq(sources.active, true), sql`${sources.config}->>'verified' = 'true'`))
    .innerJoin(productVariants, and(eq(productVariants.id, externalListings.variantId), eq(priceObservations.condition, productVariants.condition), eq(priceObservations.finish, productVariants.finish)))
    .innerJoin(
      inventoryItems,
      and(
        eq(inventoryItems.variantId, externalListings.variantId),
        eq(inventoryItems.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(priceObservations.available, true),
        eq(priceObservations.currency, "BRL"),
        eq(priceObservations.region, "BR"),
        eq(priceObservations.type, "reference"),
        gt(priceObservations.referenceAt, sinceDate)
      )
    )
    .groupBy(sql`to_char(${priceObservations.referenceAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${priceObservations.referenceAt}, 'YYYY-MM-DD') ASC`);

  // 2. Obter alterações de preços da loja no período
  const storeRows = await db
    .select({
      day: sql<string>`to_char(${priceChangeHistory.appliedAt}, 'YYYY-MM-DD')`.as("day"),
      avgPrice: sql<string>`avg(${priceChangeHistory.newPrice})`.as("avg_price"),
    })
    .from(priceChangeHistory)
    .where(
      and(
        eq(priceChangeHistory.organizationId, organizationId),
        gt(priceChangeHistory.appliedAt, sinceDate)
      )
    )
    .groupBy(sql`to_char(${priceChangeHistory.appliedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${priceChangeHistory.appliedAt}, 'YYYY-MM-DD') ASC`);

  const storeMap = new Map<string, number>();
  for (const row of storeRows) {
    storeMap.set(row.day, Number(row.avgPrice));
  }

  // Preço médio atual de inventário como fallback para a loja
  // 3. Avaliar se há histórico real suficiente (mínimo de 2 pontos temporais)
  if (marketRows.length < 2) {
    return {
      hasData: false,
      days: safeDays,
      points: [],
      summary: null,
    };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let sumPrice = 0;
  let totalObservations = 0;

  const points: PriceHistoryPoint[] = marketRows.map((row) => {
    const marketP = Number(Number(row.avgPrice).toFixed(2));
    const storeP = storeMap.get(row.day) ?? null;

    if (marketP < minPrice) minPrice = marketP;
    if (marketP > maxPrice) maxPrice = marketP;
    sumPrice += marketP;
    totalObservations += Number(row.count);

    const [, month, day] = row.day.split("-");
    const displayDate = `${day}/${month}`;

    return {
      date: row.day,
      displayDate,
      marketPrice: marketP,
      storePrice: storeP ? Number(storeP.toFixed(2)) : null,
    };
  });

  const firstPoint = points[0].marketPrice ?? 0;
  const lastPoint = points[points.length - 1].marketPrice ?? 0;
  const percentageChange =
    firstPoint > 0 ? Number((((lastPoint - firstPoint) / firstPoint) * 100).toFixed(1)) : 0;
  const avgMarketPrice = Number((sumPrice / points.length).toFixed(2));

  return {
    hasData: true,
    days: safeDays,
    points,
    summary: {
      minPrice,
      maxPrice,
      avgMarketPrice,
      percentageChange,
      totalObservations,
    },
  };
}
