import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { indexRuns, indexSources } from "../src/db/schema";
import { parseMypCard, type IndexGame } from "../src/server/geekprice-index/core";
import { ensureMypSource, storeIndexQuote } from "../src/server/geekprice-index/service";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";

// The documented bulk endpoint requires approved API access. This worker never
// falls back to browser sessions, proxies, or anonymous page scraping.
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
if (!args.has("--approved")) throw new Error("Use --approved após confirmar a fonte e o banco isolado.");
const target = assertIsolatedIndexDatabase();
const token = process.env.MYP_CARDS_API_TOKEN?.trim();
if (!token) throw new Error("MYP_CARDS_API_TOKEN ausente. Solicite acesso oficial antes da coleta em lotes.");
const gameArg = args.get("--game") ?? "pokemon";
if (gameArg !== "pokemon" && gameArg !== "magic") throw new Error("--game deve ser pokemon ou magic.");
const game: IndexGame = gameArg;
const maxPages = Number(args.get("--max-pages") ?? "20");
if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 200) throw new Error("--max-pages deve estar entre 1 e 200.");
const runId = args.get("--run-id");
if (runId && !/^[a-f\d-]{36}$/i.test(runId)) throw new Error("--run-id inválido.");

async function fetchPage(selectedGame: IndexGame, page: number) {
  const url = new URL(`https://mypcards.com/api/v1/${selectedGame}/precos`);
  url.searchParams.set("page_number", String(page));
  url.searchParams.set("page_size", "50");
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Api-Token": token! },
    signal: AbortSignal.timeout(15_000) });
  if (response.status === 401 || response.status === 403 || response.status === 429)
    throw new Error(`MYP HTTP ${response.status}. A coleta foi interrompida sem contornar o controle de acesso ou limite.`);
  if (!response.ok) throw new Error(`MYP HTTP ${response.status}.`);
  const body = await response.json() as { cards?: unknown[]; page_number?: number };
  if (!Array.isArray(body.cards) || (body.page_number != null && body.page_number !== page))
    throw new Error("Formato ou página da resposta MYP inesperado.");
  return body.cards;
}

async function main() {
  const source = await ensureMypSource();
  let run = runId ? (await db.select().from(indexRuns).where(and(eq(indexRuns.id, runId),
    eq(indexRuns.sourceId, source.id))).limit(1))[0] :
    (await db.insert(indexRuns).values({ sourceId: source.id }).returning())[0];
  if (!run || run.status === "completed") throw new Error("Execução não encontrada ou já concluída.");
  let pages = 0;
  try {
    while (pages < maxPages) {
      const page = run.cursor + 1;
      const observedAt = new Date();
      const cards = await fetchPage(game, page);
      let priced = 0;
      for (const raw of cards) {
        const quote = parseMypCard(game, raw, observedAt);
        if (!quote) continue;
        await storeIndexQuote(quote);
        priced++;
      }
      const done = cards.length === 0 || cards.length < 50;
      [run] = await db.update(indexRuns).set({ cursor: page, searched: run.searched + cards.length,
        priced: run.priced + priced, status: done ? "completed" : "running",
        finishedAt: done ? new Date() : null, lastError: null }).where(eq(indexRuns.id, run.id)).returning();
      await db.update(indexSources).set({ lastSuccessAt: observedAt }).where(eq(indexSources.id, source.id));
      pages++;
      if (done) break;
      // Official authenticated allowance is 60 requests/minute; leave headroom.
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    if (run.status === "running") [run] = await db.update(indexRuns).set({ status: "partial" })
      .where(eq(indexRuns.id, run.id)).returning();
    console.log(JSON.stringify({ target, runId: run.id, game, status: run.status,
      pageCursor: run.cursor, pagesProcessed: pages, productsSearched: run.searched,
      pricedRowsProcessed: run.priced }));
  } catch (cause) {
    await db.update(indexRuns).set({ status: "partial", errors: run.errors + 1,
      lastError: String(cause).slice(0, 1000) }).where(eq(indexRuns.id, run.id));
    await db.update(indexSources).set({ lastErrorAt: new Date() }).where(eq(indexSources.id, source.id));
    throw cause;
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
