import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, desc } from "drizzle-orm";
import { db } from "../src/db";
import { indexRuns, indexSources } from "../src/db/schema";
import { parseMypCard, parsePilotTsv } from "../src/server/geekprice-index/core";
import { ensureMypSource, storeIndexQuote } from "../src/server/geekprice-index/service";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";

const args = process.argv.slice(2);
if (!args.includes("--approved")) throw new Error("Atualização requer --approved e execução manual em banco isolado.");
const offlinePilot = args.includes("--offline-pilot");
assertIsolatedIndexDatabase();
const batchArg = args.find((item) => item.startsWith("--max-groups="));
const maxGroups = batchArg ? Number(batchArg.split("=")[1]) : 4;
if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 20) throw new Error("--max-groups deve ser 1–20.");

async function fetchGroup(game: "pokemon" | "magic", name: string) {
  const url = `https://mypcards.com/api/v1/${game}/carta/${encodeURIComponent(name)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { signal: controller.signal,
        headers: { Accept: "application/json", ...(process.env.MYP_CARDS_API_TOKEN ? { "X-Api-Token": process.env.MYP_CARDS_API_TOKEN } : {}) } });
      if (response.status === 429 || response.status === 401 || response.status === 403) throw new Error(`MYP HTTP ${response.status}; interrompido sem contornar limite.`);
      if (!response.ok) throw new Error(`MYP HTTP ${response.status}`);
      const body = await response.json() as { cards?: unknown[] };
      if (!Array.isArray(body.cards)) throw new Error("Formato de resposta MYP alterado.");
      return body.cards;
    } catch (error) {
      if (attempt === 2 || /HTTP (429|401|403)/.test(String(error))) throw error;
      await new Promise((done) => setTimeout(done, (attempt + 1) * 1500));
    } finally { clearTimeout(timer); }
  }
  return [];
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve("data/geekprice-index/manifest.json"), "utf8")) as { observed_at: string };
  const quotes = parsePilotTsv(await readFile(resolve("data/geekprice-index/mypcards-pilot.tsv"), "utf8"), new Date(manifest.observed_at));
  const selected = new Set(quotes.map((quote) => quote.canonicalId.toLowerCase()));
  const groups = [...new Map(quotes.map((quote) => [`${quote.game}:${quote.name.replace(/ \(.*\)$/, "")}`, { game: quote.game, name: quote.name.replace(/ \(.*\)$/, "") }])).values()];
  const source = await ensureMypSource();
  const [previous] = await db.select().from(indexRuns).where(eq(indexRuns.sourceId, source.id)).orderBy(desc(indexRuns.startedAt)).limit(1);
  const run = previous?.status === "running" || previous?.status === "partial" ? previous :
    (await db.insert(indexRuns).values({ sourceId: source.id }).returning())[0];
  let completed = 0;
  let pricedTotal = run.priced;
  for (let cursor = run.cursor; cursor < groups.length && completed < maxGroups; cursor++) {
    const group = groups[cursor];
    try {
      const now = offlinePilot ? new Date(manifest.observed_at) : new Date();
      const cards = offlinePilot ? [] : await fetchGroup(group.game, group.name);
      let priced = 0;
      const parsed = offlinePilot ? quotes.filter((quote) => quote.game === group.game &&
        quote.name.replace(/ \(.*\)$/, "") === group.name) : cards.map((raw) => parseMypCard(group.game, raw, now));
      for (const quote of parsed) {
        if (quote && selected.has(quote.canonicalId.toLowerCase())) { await storeIndexQuote(quote); priced++; }
      }
      pricedTotal += priced;
      await db.update(indexRuns).set({ cursor: cursor + 1, searched: run.searched + completed + 1,
        priced: pricedTotal, status: "running", lastError: null }).where(eq(indexRuns.id, run.id));
      await db.update(indexSources).set({ lastSuccessAt: now }).where(eq(indexSources.id, source.id));
      completed++;
      // Anonymous MYP access is 10 requests/minute. Keep a conservative gap.
      if (!offlinePilot && !process.env.MYP_CARDS_API_TOKEN && cursor + 1 < groups.length) await new Promise((done) => setTimeout(done, 7000));
    } catch (error) {
      await db.update(indexRuns).set({ errors: run.errors + 1, status: "partial", lastError: String(error).slice(0, 1000) }).where(eq(indexRuns.id, run.id));
      await db.update(indexSources).set({ lastErrorAt: new Date() }).where(eq(indexSources.id, source.id));
      throw error;
    }
  }
  const [current] = await db.select().from(indexRuns).where(eq(indexRuns.id, run.id)).limit(1);
  if (current.cursor >= groups.length) await db.update(indexRuns).set({ status: "completed", finishedAt: new Date() }).where(eq(indexRuns.id, run.id));
  console.log(JSON.stringify({ runId: run.id, cursor: current.cursor, groups: groups.length, processed: completed }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
