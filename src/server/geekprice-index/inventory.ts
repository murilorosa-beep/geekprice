import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexCards, indexInventoryLinks, inventoryItems, products, productVariants } from "@/db/schema";
import { calculateRecommendation } from "@/lib/pricing";
import { getActivePricingPolicy } from "@/server/settings/service";
import { matchStockPrinting, normalizeCollectorNumber, type IndexGame } from "./core";
import { getPilotFallbackQuotes, indexAvailable } from "./references";
import { getIndexCardPrices } from "./service";

function localManualPilotAllowed() {
  if (process.env.APP_ENV === "production") return false;
  if (process.env.INDEX_ALLOW_UNAPPROVED_REFERENCE_MANUAL === "false") return false;
  if (process.env.INDEX_ALLOW_UNAPPROVED_REFERENCE_MANUAL === "true") {
    try {
      const url = new URL(process.env.DATABASE_URL ?? "");
      return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) &&
        decodeURIComponent(url.pathname.slice(1)) === "geekprice_index_dev";
    } catch { return false; }
  }
  return process.env.NODE_ENV !== "production";
}

async function getStockItem(organizationId: string, inventoryItemId: string) {
  const [item] = await db.select({
    id: inventoryItems.id, organizationId: inventoryItems.organizationId, name: products.name,
    imageUrl: products.imageUrl, category: products.category, setName: productVariants.setName,
    collectorNumber: productVariants.collectorNumber, language: productVariants.language,
    finish: productVariants.finish, condition: productVariants.condition, catalogSource: productVariants.catalogSource,
    canonicalId: productVariants.canonicalId, cost: inventoryItems.cost, currentPrice: inventoryItems.price,
    desiredMarginPercent: inventoryItems.desiredMarginPercent,
  }).from(inventoryItems).innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.organizationId, organizationId))).limit(1);
  return item ?? null;
}

function stockGame(item: { category: string; catalogSource: string | null }): IndexGame | null {
  if (item.catalogSource === "tcgdex" || /pok[eé]mon/i.test(item.category)) return "pokemon";
  if (item.catalogSource === "scryfall" || /magic/i.test(item.category)) return "magic";
  return null;
}

export async function getInventoryIndexMatches(organizationId: string, inventoryItemId: string) {
  const item = await getStockItem(organizationId, inventoryItemId);
  if (!item) return null;
  const game = stockGame(item);
  const number = normalizeCollectorNumber(item.collectorNumber).number;
  const available = await indexAvailable();
  if (!available) {
    if (!game || !number) return { item, game, status: "not_found" as const, candidates: [], linkedCardId: null };
    const candidates = getPilotFallbackQuotes().filter(
      (q) => q.game === game && normalizeCollectorNumber(q.collectorNumber).number === number,
    );
    const ranked = candidates
      .map((card) => ({
        card: {
          id: card.id,
          game: card.game,
          name: card.name,
          setName: card.setName,
          collectorNumber: card.collectorNumber,
          language: card.language,
          finish: card.finish,
          condition: card.condition,
          imageUrl: null,
        },
        match: matchStockPrinting(
          {
            game,
            name: item.name,
            setName: item.setName,
            collectorNumber: item.collectorNumber,
            canonicalId: item.canonicalId,
            catalogSource: item.catalogSource,
          },
          card,
        ),
      }))
      .filter((entry) => entry.match !== "not_found")
      .sort((a, b) => (a.match === "exact" ? 0 : 1) - (b.match === "exact" ? 0 : 1));
    const top = ranked.slice(0, 20);
    const references = await getIndexCardPrices(top.map((entry) => entry.card.id));
    const priced = top.map(({ card, match }) => {
      const reference = references.get(card.id);
      return {
        card,
        match,
        reference: reference?.price
          ? {
              askingMin: reference.price.askingMin,
              providerAverage: reference.price.providerAverage,
              askingMax: reference.price.askingMax,
              observedAt: reference.price.observedAt,
              lastSeenAt: reference.price.lastSeenAt,
              source: reference.price.source,
              language: reference.price.language,
              finish: reference.price.finish,
              condition: reference.price.condition,
              quality: reference.price.quality,
              status: reference.status,
            }
          : null,
      };
    });
    const exactEntries = ranked.filter((entry) => entry.match === "exact");
    const exactCount = exactEntries.length;
    return {
      item,
      game,
      status:
        exactCount > 1
          ? ("ambiguous" as const)
          : exactCount === 1
            ? ("exact" as const)
            : ranked.length
              ? ("probable" as const)
              : ("not_found" as const),
      candidates: priced,
      linkedCardId: exactCount === 1 ? exactEntries[0].card.id : null,
      totalCandidates: ranked.length,
    };
  }
  let [linked] = await db.select({ cardId: indexInventoryLinks.cardId, matchStatus: indexInventoryLinks.matchStatus })
    .from(indexInventoryLinks).where(and(eq(indexInventoryLinks.organizationId, organizationId),
      eq(indexInventoryLinks.inventoryItemId, inventoryItemId))).limit(1);
  if (!game || !number) return { item, game, status: "not_found" as const, candidates: [], linkedCardId: linked?.cardId ?? null };
  const candidates = await db.select().from(indexCards).where(and(eq(indexCards.game, game),
    sql`coalesce(nullif(ltrim(upper(split_part(${indexCards.collectorNumber}, '/', 1)), '0'), ''), '0') = ${number}`));
  const ranked = candidates.map((card) => ({ card, match: matchStockPrinting({ game, name: item.name,
    setName: item.setName, collectorNumber: item.collectorNumber, canonicalId: item.canonicalId, catalogSource: item.catalogSource }, card) }))
    .filter((entry) => entry.match !== "not_found")
    .sort((a, b) => (a.match === "exact" ? 0 : 1) - (b.match === "exact" ? 0 : 1));
  const exactEntries = ranked.filter((entry) => entry.match === "exact" && entry.card.matchStatus === "exact");
  const exactCount = ranked.filter((entry) => entry.match === "exact").length;
  if (!linked && exactCount === 1 && exactEntries.length === 1) {
    await db.insert(indexInventoryLinks).values({
      organizationId,
      inventoryItemId,
      cardId: exactEntries[0].card.id,
      matchStatus: "exact",
    }).onConflictDoNothing({ target: [indexInventoryLinks.organizationId, indexInventoryLinks.inventoryItemId] });
    linked = { cardId: exactEntries[0].card.id, matchStatus: "exact" };
  }
  const top = ranked.slice(0, 20);
  const linkedCandidate = ranked.find((entry) => entry.card.id === linked?.cardId);
  if (linkedCandidate && !top.includes(linkedCandidate)) top.push(linkedCandidate);
  const references = await getIndexCardPrices(top.map((entry) => entry.card.id));
  const priced = await Promise.all(top.map(async ({ card, match }) => {
    const reference = references.get(card.id);
    return { card: { id: card.id, game: card.game, name: card.name, setName: card.setName,
      collectorNumber: card.collectorNumber, language: card.language, finish: card.finish,
      condition: card.condition, imageUrl: card.imageUrl }, match, reference: reference?.price ? {
      askingMin: reference.price.askingMin, providerAverage: reference.price.providerAverage,
      askingMax: reference.price.askingMax, observedAt: reference.price.observedAt,
      lastSeenAt: reference.price.lastSeenAt, source: reference.price.source,
      language: reference.price.language, finish: reference.price.finish, condition: reference.price.condition,
      quality: reference.price.quality, status: reference.status,
    } : null };
  }));
  return { item, game, status: exactCount > 1 ? "ambiguous" as const : exactCount === 1 ? "exact" as const :
    ranked.length ? "probable" as const : "not_found" as const,
    candidates: priced, linkedCardId: linked?.cardId ?? null, totalCandidates: ranked.length };
}

export async function selectInventoryIndexCard(organizationId: string, inventoryItemId: string, cardId: string, userId: string) {
  const context = await getInventoryIndexMatches(organizationId, inventoryItemId);
  if (!context) return null;
  const candidate = context.candidates.find((entry) => entry.card.id === cardId);
  if (!candidate) throw new Error("A impressão escolhida não corresponde ao item. Revise nome, edição e número.");
  if (!await indexAvailable()) {
    return {
      organizationId,
      inventoryItemId,
      cardId,
      matchStatus: candidate.match,
      confirmedById: userId,
      confirmedAt: new Date(),
    };
  }
  const [link] = await db.insert(indexInventoryLinks).values({ organizationId, inventoryItemId, cardId,
    matchStatus: candidate.match, confirmedById: userId }).onConflictDoUpdate({
    target: [indexInventoryLinks.organizationId, indexInventoryLinks.inventoryItemId],
    set: { cardId, matchStatus: candidate.match, confirmedById: userId, confirmedAt: new Date() },
  }).returning();
  return link;
}

export async function getIndexPricingPreview(organizationId: string, inventoryItemId: string) {
  const context = await getInventoryIndexMatches(organizationId, inventoryItemId);
  if (!context) return null;
  const selected = context.candidates.find((entry) => entry.card.id === context.linkedCardId);
  if (!selected?.reference) return { ...context, pricing: null, reason: selected ? "Impressão sem preço BRL." : "Escolha uma impressão antes de calcular." };
  const policy = await getActivePricingPolicy(organizationId);
  const effective = policy ?? { feePercent: 12, additionalCostPercent: 0, minimumMarginPercent: 20,
    desiredMarginPercent: 25, marketDiscountPercent: 3 };
  const referenceValue = selected.reference.providerAverage ?? selected.reference.askingMin;
  const desiredMargin = Math.max(Number(context.item.desiredMarginPercent), effective.minimumMarginPercent,
    effective.desiredMarginPercent);
  const pricing = calculateRecommendation({ cost: Number(context.item.cost), currentPrice: Number(context.item.currentPrice),
    marketPrice: Number(referenceValue), feesPercent: effective.feePercent,
    additionalCostsPercent: effective.additionalCostPercent, minimumMarginPercent: effective.minimumMarginPercent,
    desiredMarginPercent: desiredMargin, marketDiscountPercent: effective.marketDiscountPercent,
    maxChangePercent: 15, roundingMode: "ends_90", hasUnverifiedMarketReference: true });
  return { ...context, pricing: { referenceValue, referenceKind: selected.reference.providerAverage ? "provider_average" : "asking_minimum",
    feePercent: effective.feePercent, additionalCostPercent: effective.additionalCostPercent,
    desiredMarginPercent: desiredMargin, minimumMarginPercent: effective.minimumMarginPercent,
    ...pricing, manualReviewRequired: true, autoApplyEligible: false,
    canManuallyApprove: selected.match === "exact" && ["language", "finish", "condition"].every((key) => { const field = key as "language" | "finish" | "condition"; return (!selected.card[field] || selected.card[field] === context.item[field]) && (!selected.reference?.[field] || selected.reference[field] === context.item[field]); }) && selected.reference.status === "current" &&
      (selected.reference.source.commercialApproved || localManualPilotAllowed()),
  }, reason: null };
}
