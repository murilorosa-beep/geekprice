import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { count } from "drizzle-orm";
import { db } from "../src/db";
import { indexCards, indexObservations } from "../src/db/schema";
import { parsePilotTsv } from "../src/server/geekprice-index/core";
import { getIndexCardPrice, getIndexCoverage, getIndexHistory, searchIndexCards, storeIndexQuote } from "../src/server/geekprice-index/service";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";

async function main() {
  const target = assertIsolatedIndexDatabase();
  const manifest = JSON.parse(await readFile(resolve("data/geekprice-index/manifest.json"), "utf8")) as { observed_at: string };
  const quotes = parsePilotTsv(await readFile(resolve("data/geekprice-index/mypcards-pilot.tsv"), "utf8"), new Date(manifest.observed_at));
  const coverage = await getIndexCoverage();
  assert.equal(coverage.cards, 70);
  assert.equal(coverage.priced, 70);
  assert.equal(coverage.observations, 70);
  const results = await searchIndexCards({ q: "Charizard", game: "pokemon", limit: 50 });
  const base = results.find((card) => card.canonicalId === "pokemon_bs_004/102");
  const base2 = results.find((card) => card.canonicalId === "pokemon_b2_004/130");
  assert.ok(base && base2 && base.id !== base2.id);
  const price = await getIndexCardPrice(base.id);
  assert.ok(price?.price);
  assert.equal(price?.price?.askingMin, "1500.00");
  assert.equal(price?.price?.providerAverage, "5180.43");
  assert.equal(price?.price?.source.name, "MYP Cards");
  assert.equal(price?.price?.autoApplyEligible, false);
  const history = await getIndexHistory(base.id);
  assert.equal(history.length, 1);
  await storeIndexQuote(quotes.find((quote) => quote.canonicalId === base.canonicalId)!);
  const [after] = await db.select({ value: count() }).from(indexObservations);
  assert.equal(after.value, 70, "Reimportar a mesma cotação não pode criar histórico falso.");
  const [cardCount] = await db.select({ value: count() }).from(indexCards);
  assert.equal(cardCount.value, 70);
  console.log(JSON.stringify({ target, cards: coverage.cards, observations: after.value,
    charizardBaseSet: { id: base.id, askingMin: price.price.askingMin, providerAverage: price.price.providerAverage, source: price.price.source.name },
    historyRows: history.length, duplicateBlocked: true }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
