import { createHash } from "node:crypto";
import Decimal from "decimal.js";

export type IndexGame = "pokemon" | "magic";
export type IndexMatch = "exact" | "probable" | "ambiguous" | "not_found";

export type StockPrinting = { game: IndexGame; name: string; setName: string | null; collectorNumber: string | null; canonicalId?: string | null; catalogSource?: string | null; setCode?: string | null };
export type IndexPrinting = { game: string; name: string; setName: string; collectorNumber: string; canonicalId?: string | null; catalogSource?: string | null; setCode?: string | null };

export function normalizePrintingText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeCollectorNumber(value: string | null | undefined) {
  const raw = (value ?? "").trim().toUpperCase();
  const [number, total] = raw.split("/");
  const normalized = (part: string) => /^\d+$/.test(part) ? String(Number(part)) : part.replace(/[^A-Z0-9]/g, "");
  return { number: normalized(number ?? ""), total: total ? normalized(total) : null };
}

export function matchStockPrinting(stock: StockPrinting, card: IndexPrinting): "exact" | "probable" | "not_found" {
  if (stock.game !== card.game || !stock.name || !stock.collectorNumber) return "not_found";
  const a = normalizeCollectorNumber(stock.collectorNumber);
  const b = normalizeCollectorNumber(card.collectorNumber);
  if (!a.number || a.number !== b.number || (a.total && b.total && a.total !== b.total)) return "not_found";
  const sameName = normalizePrintingText(stock.name) === normalizePrintingText(card.name);
  const canonicalSet = stock.catalogSource === "tcgdex" ? stock.canonicalId?.split("-")[0] : null;
  const stockCode = stock.setCode ?? canonicalSet;
  const sameCode = Boolean(stockCode && card.setCode && printingSetKey(stock.game, stockCode) === printingSetKey(card.game, card.setCode));
  const sameCanonical = Boolean(stock.canonicalId && stock.catalogSource && stock.catalogSource === card.catalogSource && stock.canonicalId === card.canonicalId);
  const sameSet = Boolean(stock.setName && printingSetKey(stock.game, stock.setName) === printingSetKey(stock.game, card.setName)) || (!stock.setName && (sameCode || sameCanonical));
  return sameName && sameSet ? "exact" : sameName || sameSet ? "probable" : "not_found";
}

// Explicit, game-scoped equivalences; never strip arbitrary prefixes or fuzzy-match names.
export function printingSetKey(game: string, name: string) {
  const groups: Record<string, string[][]> = {
    pokemon: [["Base Set", "Coleção Básica", "base1", "bs"], ["Base Set 2", "base4", "b2"],
      ["Evolutions", "XY 12: Evolutions", "Evoluções", "xy12", "evo"],
      ["Vivid Voltage", "Sword & Shield 4: Vivid Voltage", "Voltagem Vívida", "swsh4", "viv"]],
    magic: [["Revised Edition", "Revised", "3ed", "rev"], ["Magic 2010", "m10"]],
  };
  const key = normalizePrintingText(name);
  const group = groups[game]?.find((aliases) => aliases.some((alias) => normalizePrintingText(alias) === key));
  return group ? normalizePrintingText(group[0]) : key;
}

export type IndexQuote = {
  game: IndexGame;
  name: string;
  canonicalId: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  sourceExternalId: string;
  sourceUrl: string;
  priceMin: string;
  providerAverage: string | null;
  priceMax: string;
  availableQuantity: number | null;
  observedAt: Date;
  language: string | null;
  finish: string | null;
  condition: string | null;
};

export function parseBrl(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Preço BRL ausente.");
  let raw = String(value).trim().replace(/^R\$\s*/, "");
  if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error("Preço BRL inválido.");
  const amount = new Decimal(raw);
  if (!amount.isFinite() || amount.lte(0) || amount.gt("999999999999.99")) throw new Error("Preço BRL fora do intervalo.");
  return amount.toFixed(2);
}

export function parseMypCard(game: IndexGame, value: unknown, observedAt: Date): IndexQuote | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const code = String(card.card_code ?? "").trim();
  const match = code.match(new RegExp(`^${game}_(.+)_([^_]+)$`, "i"));
  if (!match || !Number.isSafeInteger(Number(card.internal_code))) return null;
  const name = String(card.name_en || card.name_pt || "").trim();
  const setName = String(card.edition_en || card.edition_pt || "").trim();
  const url = String(card.link || "");
  if (!name || !setName || !/^https:\/\/mypcards\.com\//i.test(url)) return null;
  try {
    const priceMin = parseBrl(card.min_price);
    const priceMax = parseBrl(card.max_price);
    const providerAverage = card.avg_price == null ? null : parseBrl(card.avg_price);
    if (new Decimal(priceMax).lt(priceMin) || (providerAverage &&
      (new Decimal(providerAverage).lt(priceMin) || new Decimal(providerAverage).gt(priceMax)))) return null;
    return {
      game, name, canonicalId: code, setName, setCode: match[1], collectorNumber: match[2],
      sourceExternalId: String(card.internal_code), sourceUrl: url,
      priceMin, providerAverage, priceMax,
      availableQuantity: Number.isSafeInteger(card.available_quantity) && Number(card.available_quantity) >= 0 ? Number(card.available_quantity) : null,
      observedAt, language: null, finish: null, condition: null,
    };
  } catch { return null; }
}

export function parsePilotTsv(content: string, observedAt: Date): IndexQuote[] {
  const lines = content.trim().split(/\r?\n/);
  const expected = "game\tname\tcode\tset\tid\tmin\tavg\tmax\tquantity\turl";
  if (lines.shift() !== expected) throw new Error("Cabeçalho do piloto inválido.");
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const parts = line.split("\t");
    if (parts.length !== 10) throw new Error(`Linha ${index + 2} inválida.`);
    const [game, name, code, setName, id, min, avg, max, quantity, url] = parts;
    if (game !== "pokemon" && game !== "magic") throw new Error(`Jogo inválido na linha ${index + 2}.`);
    const quote = parseMypCard(game, {
      name_en: name, card_code: code, edition_en: setName, internal_code: Number(id),
      min_price: min, avg_price: avg, max_price: max, available_quantity: Number(quantity), link: url,
    }, observedAt);
    if (!quote || seen.has(`${game}:${code}`)) throw new Error(`Cotação inválida ou duplicada na linha ${index + 2}.`);
    seen.add(`${game}:${code}`);
    return quote;
  });
}

export function quoteFingerprint(quote: IndexQuote): string {
  return createHash("sha256").update([
    quote.game, quote.canonicalId, quote.sourceExternalId, quote.priceMin,
    quote.providerAverage ?? "", quote.priceMax, quote.availableQuantity ?? "",
    quote.language ?? "", quote.finish ?? "", quote.condition ?? "",
  ].join("|")).digest("hex");
}

export function matchIndexCard(target: Pick<IndexQuote, "game" | "canonicalId" | "setCode" | "collectorNumber" | "finish" | "language" | "condition">,
  candidates: Array<Pick<IndexQuote, "game" | "canonicalId" | "setCode" | "collectorNumber" | "finish" | "language" | "condition">>): IndexMatch {
  const sameGame = candidates.filter((item) => item.game === target.game);
  const exact = sameGame.filter((item) => item.canonicalId === target.canonicalId &&
    item.setCode.toLowerCase() === target.setCode.toLowerCase() &&
    item.collectorNumber.toLowerCase() === target.collectorNumber.toLowerCase() &&
    (!target.finish || item.finish === target.finish) && (!target.language || item.language === target.language) &&
    (!target.condition || item.condition === target.condition));
  if (exact.length === 1) return "exact";
  if (exact.length > 1) return "ambiguous";
  const print = sameGame.filter((item) => item.setCode.toLowerCase() === target.setCode.toLowerCase() &&
    item.collectorNumber.toLowerCase() === target.collectorNumber.toLowerCase() &&
    (!target.finish || !item.finish || item.finish === target.finish) &&
    (!target.language || !item.language || item.language === target.language) &&
    (!target.condition || !item.condition || item.condition === target.condition));
  return print.length > 1 ? "ambiguous" : print.length === 1 ? "probable" : "not_found";
}

export function describeQuoteQuality(observedAt: Date, availableQuantity: number | null, sourceCount: number, match: IndexMatch, now = new Date()) {
  const ageDays = Math.max(0, (now.getTime() - observedAt.getTime()) / 86_400_000);
  let score = match === "exact" ? 0.32 : match === "probable" ? 0.12 : 0;
  if (ageDays <= 7) score += 0.12;
  else if (ageDays <= 30) score += 0.06;
  if (availableQuantity != null && availableQuantity >= 3) score += 0.08;
  if (sourceCount >= 2) score += 0.2;
  // Provider summaries do not reveal languages, finishes, conditions or individual sales.
  score = Math.min(score, sourceCount === 1 ? 0.52 : 0.72);
  return { score: Number(score.toFixed(2)), level: score >= 0.7 ? "high" : score >= 0.4 ? "limited" : "low", ageDays: Math.floor(ageDays),
    reasons: ["Resumo de anúncios; não representa venda concluída", "Idioma, acabamento e condição não informados pela fonte", ...(sourceCount === 1 ? ["Fonte única"] : [])] };
}
