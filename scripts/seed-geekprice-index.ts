import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";
import { parsePilotTsv } from "../src/server/geekprice-index/core";
import { storeIndexQuote } from "../src/server/geekprice-index/service";
import { db } from "../src/db";
import { indexSources } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const target = assertIsolatedIndexDatabase();
  const manifest = JSON.parse(await readFile(resolve("data/geekprice-index/manifest.json"), "utf8")) as { observed_at: string };
  const content = await readFile(resolve("data/geekprice-index/mypcards-pilot.tsv"), "utf8");
  const quotes = parsePilotTsv(content, new Date(manifest.observed_at));
  if (quotes.length !== 70) throw new Error(`Piloto incompleto: ${quotes.length}/70.`);
  let stored = 0;
  for (const quote of quotes) { await storeIndexQuote(quote); stored++; }
  await db.update(indexSources).set({ lastSuccessAt: new Date(manifest.observed_at) }).where(eq(indexSources.code, "mypcards_public_api"));
  console.log(JSON.stringify({ target, searched: quotes.length, priced: stored, source: "MYP Cards", observedAt: manifest.observed_at }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
