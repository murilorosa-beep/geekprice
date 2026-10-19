import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexCards, indexObservations, indexRuns, indexSources } from "@/db/schema";
import { describeQuoteQuality, quoteFingerprint, type IndexGame, type IndexQuote } from "./core";
import { getPilotFallbackQuotes, indexAvailable } from "./references";

const sourceCode = "mypcards_public_api";

export async function ensureMypSource() {
  const [source] = await db.insert(indexSources).values({
    code: sourceCode, name: "MYP Cards", baseUrl: "https://mypcards.com",
    active: true, commercialApproved: false, acquisitionMethod: "public_api",
    rightsReference: "https://mypcards.com/acesso-api",
  }).onConflictDoUpdate({ target: indexSources.code, set: { acquisitionMethod: "public_api",
    rightsReference: "https://mypcards.com/acesso-api", updatedAt: new Date() } }).returning();
  return source;
}

export async function storeIndexQuote(quote: IndexQuote) {
  const source = await ensureMypSource();
  return db.transaction(async (tx) => {
    const [card] = await tx.insert(indexCards).values({
      game: quote.game, catalogSource: "mypcards", canonicalId: quote.canonicalId,
      name: quote.name, setName: quote.setName, setCode: quote.setCode,
      collectorNumber: quote.collectorNumber, language: quote.language, finish: quote.finish,
      condition: quote.condition, matchStatus: "exact", coverageStatus: "priced",
    }).onConflictDoUpdate({
      target: [indexCards.game, indexCards.catalogSource, indexCards.canonicalId],
      set: { name: quote.name, setName: quote.setName, setCode: quote.setCode,
        collectorNumber: quote.collectorNumber, coverageStatus: "priced", updatedAt: new Date() },
    }).returning({ id: indexCards.id });
    const fingerprint = quoteFingerprint(quote);
    const inserted = await tx.insert(indexObservations).values({
      cardId: card.id, sourceId: source.id, sourceExternalId: quote.sourceExternalId,
      sourceUrl: quote.sourceUrl, priceMin: quote.priceMin, providerAverage: quote.providerAverage,
      priceMax: quote.priceMax, availableQuantity: quote.availableQuantity,
      language: quote.language, finish: quote.finish, condition: quote.condition,
      observedAt: quote.observedAt, lastSeenAt: quote.observedAt, fingerprint,
    }).onConflictDoUpdate({ target: indexObservations.fingerprint,
      set: { lastSeenAt: sql`greatest(${indexObservations.lastSeenAt}, ${quote.observedAt.toISOString()}::timestamptz)`, availableQuantity: quote.availableQuantity, sourceUrl: quote.sourceUrl },
    }).returning({ id: indexObservations.id });
    return { cardId: card.id, observationId: inserted[0].id };
  });
}

export async function searchIndexCards(query: { q: string; game?: IndexGame; limit: number; page?: number }) {
  if (!await indexAvailable()) {
    const qLower = query.q.toLowerCase();
    const filtered = getPilotFallbackQuotes()
      .filter((c) => c.name.toLowerCase().includes(qLower) && (!query.game || c.game === query.game))
      .sort((a, b) => a.name.localeCompare(b.name) || a.setName.localeCompare(b.setName) || a.collectorNumber.localeCompare(b.collectorNumber));
    const offset = ((query.page ?? 1) - 1) * query.limit;
    return filtered.slice(offset, offset + query.limit).map((c) => ({
      id: c.id, game: c.game, name: c.name, setName: c.setName, setCode: c.setCode,
      collectorNumber: c.collectorNumber, imageUrl: null as string | null, language: c.language,
      finish: c.finish, canonicalId: c.canonicalId, coverageStatus: "priced",
      referenceBrl: c.providerAverage ?? c.priceMin, lastSeenAt: c.observedAt,
    }));
  }
  const clauses = [ilike(indexCards.name, `%${query.q.replace(/[%_]/g, "\\$&")}%`)];
  if (query.game) clauses.push(eq(indexCards.game, query.game));
  return db.select({ id: indexCards.id, game: indexCards.game, name: indexCards.name,
    setName: indexCards.setName, setCode: indexCards.setCode, collectorNumber: indexCards.collectorNumber,
    imageUrl: indexCards.imageUrl, language: indexCards.language, finish: indexCards.finish,
    canonicalId: indexCards.canonicalId, coverageStatus: indexCards.coverageStatus,
    referenceBrl: sql<string | null>`(select coalesce(o.provider_average, o.price_min) from index_observations o where o.card_id = index_cards.id order by o.last_seen_at desc limit 1)`,
    lastSeenAt: sql<Date | null>`(select o.last_seen_at from index_observations o where o.card_id = index_cards.id order by o.last_seen_at desc limit 1)`,
  }).from(indexCards).where(and(...clauses)).orderBy(indexCards.name, indexCards.setName, indexCards.collectorNumber)
    .limit(query.limit).offset(((query.page ?? 1) - 1) * query.limit);
}

export async function countIndexSearchCards(query: { q: string; game?: IndexGame }) {
  if (!await indexAvailable()) {
    const qLower = query.q.toLowerCase();
    return getPilotFallbackQuotes().filter((c) => c.name.toLowerCase().includes(qLower) && (!query.game || c.game === query.game)).length;
  }
  const clauses = [ilike(indexCards.name, `%${query.q.replace(/[%_]/g, "\\$&")}%`)];
  if (query.game) clauses.push(eq(indexCards.game, query.game));
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(indexCards).where(and(...clauses));
  return row.count;
}

export async function getIndexCardPrice(id: string) {
  return (await getIndexCardPrices([id])).get(id) ?? null;
}

export async function getIndexCardPrices(ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof formatIndexPrice>>();
  if (!await indexAvailable()) {
    const idSet = new Set(ids);
    const pilot = getPilotFallbackQuotes().filter((c) => idSet.has(c.id));
    const fallbackSource: typeof indexSources.$inferSelect = {
      id: "00000000-0000-4000-8000-000000000001", code: sourceCode, name: "MYP Cards",
      baseUrl: "https://mypcards.com", active: true, commercialApproved: false,
      acquisitionMethod: "public_api", rightsReference: "https://mypcards.com/acesso-api",
      lastSuccessAt: pilot[0]?.observedAt ?? null, lastErrorAt: null,
      createdAt: pilot[0]?.observedAt ?? new Date(), updatedAt: pilot[0]?.observedAt ?? new Date(),
    };
    return new Map(pilot.map((q) => {
      const cardRow: typeof indexCards.$inferSelect = {
        id: q.id, game: q.game, catalogSource: "mypcards", canonicalId: q.canonicalId,
        name: q.name, setName: q.setName, setCode: q.setCode, collectorNumber: q.collectorNumber,
        imageUrl: null, language: q.language, finish: q.finish, condition: q.condition,
        matchStatus: "exact", coverageStatus: "priced", createdAt: q.observedAt, updatedAt: q.observedAt,
      };
      const obsRow: typeof indexObservations.$inferSelect = {
        id: q.id, cardId: q.id, sourceId: fallbackSource.id, sourceExternalId: q.sourceExternalId,
        sourceUrl: q.sourceUrl, priceMin: q.priceMin, providerAverage: q.providerAverage,
        priceMax: q.priceMax, currency: "BRL", priceType: "asking_summary",
        availableQuantity: q.availableQuantity, language: q.language, finish: q.finish,
        condition: q.condition, observedAt: q.observedAt, lastSeenAt: q.observedAt,
        fingerprint: quoteFingerprint(q),
      };
      return [q.id, formatIndexPrice(cardRow, [{ observation: obsRow, source: fallbackSource }])];
    }));
  }
  const cards = await db.select().from(indexCards).where(inArray(indexCards.id, ids));
  const observations = await db.select({ observation: indexObservations, source: indexSources }).from(indexObservations)
    .innerJoin(indexSources, and(eq(indexSources.id, indexObservations.sourceId), eq(indexSources.active, true)))
    .where(and(inArray(indexObservations.cardId, ids), eq(indexObservations.currency, "BRL")))
    .orderBy(desc(indexObservations.lastSeenAt), desc(indexObservations.observedAt), indexObservations.id);
  return new Map(cards.map((card) => [card.id, formatIndexPrice(card, observations.filter((row) => row.observation.cardId === card.id))]));
}
function formatIndexPrice(card: typeof indexCards.$inferSelect, rows: Array<{ observation: typeof indexObservations.$inferSelect; source: typeof indexSources.$inferSelect }>) {

  const bySource = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!bySource.has(row.source.id)) bySource.set(row.source.id, row);
  const latest = [...bySource.values()];
  const primary = latest[0];
  if (!primary) return { card, currency: "BRL" as const, price: null, status: "unpriced" as const };
  const quality = describeQuoteQuality(primary.observation.lastSeenAt, primary.observation.availableQuantity, latest.length,
    card.matchStatus === "exact" ? "exact" : "probable");
  return { card, currency: "BRL" as const, status: quality.ageDays > 30 ? "stale" as const : "current" as const,
    price: {
      askingMin: primary.observation.priceMin, askingMax: primary.observation.priceMax,
      providerAverage: primary.observation.providerAverage,
      calculatedMean: null, calculatedMedian: null, completedSale: null,
      language: primary.observation.language, finish: primary.observation.finish, condition: primary.observation.condition,
      priceType: primary.observation.priceType, observedAt: primary.observation.observedAt.toISOString(),
      lastSeenAt: primary.observation.lastSeenAt.toISOString(), availableQuantity: primary.observation.availableQuantity,
      source: { name: primary.source.name, url: primary.observation.sourceUrl, attributionUrl: primary.source.baseUrl,
        commercialApproved: primary.source.commercialApproved },
      quality, autoApplyEligible: false,
    },
  };
}

export async function getIndexHistory(id: string, limit = 100) {
  if (!await indexAvailable()) {
    const q = getPilotFallbackQuotes().find((c) => c.id === id);
    if (!q) return [];
    return [{
      observedAt: q.observedAt, lastSeenAt: q.observedAt, priceMin: q.priceMin,
      providerAverage: q.providerAverage, priceMax: q.priceMax, priceType: "asking_summary",
      availableQuantity: q.availableQuantity, source: "MYP Cards", sourceUrl: q.sourceUrl,
    }];
  }
  return db.select({ observedAt: indexObservations.observedAt, lastSeenAt: indexObservations.lastSeenAt,
    priceMin: indexObservations.priceMin, providerAverage: indexObservations.providerAverage,
    priceMax: indexObservations.priceMax, priceType: indexObservations.priceType,
    availableQuantity: indexObservations.availableQuantity, source: indexSources.name,
    sourceUrl: indexObservations.sourceUrl,
  }).from(indexObservations).innerJoin(indexSources, eq(indexSources.id, indexObservations.sourceId))
    .where(eq(indexObservations.cardId, id)).orderBy(desc(indexObservations.observedAt)).limit(limit);
}

export async function getIndexCoverage() {
  if (!await indexAvailable()) {
    const pilot = getPilotFallbackQuotes();
    const lastUpdate = pilot[0]?.observedAt ?? null;
    return {
      cards: pilot.length, priced: pilot.length, coveragePercent: null as number | null,
      coverageStatus: "catalog_not_audited" as const, unpriced: 0, currentPriced: pilot.length,
      knownVariants: 0, uniquePrintings: pilot.length, ambiguous: 0, observations: pilot.length,
      lastUpdate, collectionErrors: 0, stale: 0,
    };
  }
  const [summary] = await db.select({
    cards: sql<number>`count(*)::int`,
    priced: sql<number>`count(*) filter (where ${indexCards.coverageStatus} = 'priced')::int`,
    ambiguous: sql<number>`count(*) filter (where ${indexCards.matchStatus} = 'ambiguous')::int`,
    knownVariants: sql<number>`count(*) filter (where ${indexCards.language} is not null and ${indexCards.finish} is not null and ${indexCards.condition} is not null)::int`,
    uniquePrintings: sql<number>`count(distinct (${indexCards.game}, ${indexCards.setCode}, ${indexCards.collectorNumber}, lower(${indexCards.name})))::int`,
  }).from(indexCards);
  const [observations] = await db.select({ count: sql<number>`count(*)::int`, lastUpdate: sql<Date | null>`max(${indexObservations.lastSeenAt})` }).from(indexObservations);
  const [errors] = await db.select({ count: sql<number>`coalesce(sum(${indexRuns.errors}),0)::int` }).from(indexRuns);
  const latest = db.select({ cardId: indexObservations.cardId,
    at: sql<Date>`max(${indexObservations.lastSeenAt})`.as("at") }).from(indexObservations)
    .groupBy(indexObservations.cardId).as("latest_index_observation");
  const [stale] = await db.select({ count: sql<number>`count(*)::int` }).from(latest)
    .where(sql`${latest.at} < now() - interval '30 days'`);
  const [current] = await db.select({ count: sql<number>`count(*)::int` }).from(latest)
    .where(sql`${latest.at} >= now() - interval '30 days'`);
  // A pilot seeded from priced search results is not a valid catalog denominator.
  // Keep the raw counts visible, but do not present their ratio as market coverage.
  return { cards: summary.cards, priced: summary.priced, coveragePercent: null as number | null,
    coverageStatus: "catalog_not_audited" as const,
    unpriced: summary.cards - summary.priced, currentPriced: current.count, knownVariants: summary.knownVariants,
    uniquePrintings: summary.uniquePrintings, ambiguous: summary.ambiguous, observations: observations.count,
    lastUpdate: observations.lastUpdate, collectionErrors: errors.count, stale: stale.count };
}

export async function getIndexSources() {
  if (!await indexAvailable()) {
    const pilot = getPilotFallbackQuotes();
    return [{
      code: sourceCode, name: "MYP Cards", baseUrl: "https://mypcards.com",
      active: true, commercialApproved: false,
      lastSuccessAt: pilot[0]?.observedAt ?? null, lastErrorAt: null,
    }];
  }
  return db.select({ code: indexSources.code, name: indexSources.name, baseUrl: indexSources.baseUrl,
    active: indexSources.active, commercialApproved: indexSources.commercialApproved,
    lastSuccessAt: indexSources.lastSuccessAt, lastErrorAt: indexSources.lastErrorAt,
  }).from(indexSources).orderBy(indexSources.name);
}
