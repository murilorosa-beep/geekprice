import { z } from "zod";

const BASE_URL = "https://api.pkmnprices.com/v1/cards";

const cardSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  image_url: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  total_set_number: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  set: z.object({ id: z.number().int(), name: z.string() }).nullable().optional(),
});

const setSchema = z.object({ id: z.number().int().positive(), name: z.string(), language: z.string().optional(), card_count: z.number().int().nonnegative().optional() });

const priceSchema = z.object({
  source: z.string(),
  currency: z.string(),
  condition: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  market_price: z.number().nonnegative().nullable(),
  created_at: z.string().nullable().optional(),
});

const cardDetailSchema = cardSummarySchema.extend({
  prices: z.array(priceSchema).default([]),
});

const searchResponseSchema = z.object({ data: z.array(cardSummarySchema) });
const setsResponseSchema = z.object({ data: z.array(setSchema) });

export class PkmnPricesError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function requestJson(url: string, key: string, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json", "X-API-Key": key },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new PkmnPricesError(502, "Não foi possível conectar à PkmnPrices.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new PkmnPricesError(429, "Limite da PkmnPrices atingido. Tente novamente mais tarde.");
    if (response.status === 401 || response.status === 403) throw new PkmnPricesError(502, "A chave da PkmnPrices foi recusada ou não tem acesso a este recurso.");
    throw new PkmnPricesError(502, `PkmnPrices respondeu HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new PkmnPricesError(502, "A PkmnPrices retornou uma resposta inválida.");
  }
}

export type PkmnPricesSearch = { name?: string; number?: string; setId?: number };

function normalizeNumber(value: string) {
  const number = value.trim().split("/")[0].replace(/^0+(?=\d)/, "");
  return number.toLowerCase();
}

export async function searchPkmnPricesSets(name: string, key: string, fetcher: typeof fetch = fetch) {
  const url = new URL("https://api.pkmnprices.com/v1/sets");
  url.searchParams.set("name", name);
  url.searchParams.set("language", "English");
  url.searchParams.set("per_page", "8");
  const raw = await requestJson(url.toString(), key, fetcher);
  const parsed = setsResponseSchema.safeParse(raw);
  if (!parsed.success) throw new PkmnPricesError(502, "Formato inesperado na busca de coleções da PkmnPrices.");
  return parsed.data.data;
}

export async function searchPkmnPrices(input: PkmnPricesSearch, key: string, fetcher: typeof fetch = fetch) {
  const url = new URL(BASE_URL);
  if (input.name) url.searchParams.set("name", input.name);
  if (input.number) url.searchParams.set("number", normalizeNumber(input.number));
  if (input.setId) url.searchParams.set("set_id", String(input.setId));
  url.searchParams.set("language", "English");
  url.searchParams.set("per_page", "10");
  const raw = await requestJson(url.toString(), key, fetcher);
  const parsed = searchResponseSchema.safeParse(raw);
  if (!parsed.success) throw new PkmnPricesError(502, "Formato inesperado na busca da PkmnPrices.");
  return parsed.data.data.filter((card) =>
    (!input.number || (card.number != null && normalizeNumber(card.number) === normalizeNumber(input.number))) &&
    (!input.setId || card.set?.id === input.setId)
  ).map((card) => ({
    id: card.id,
    name: card.name,
    imageUrl: card.image_url ?? null,
    number: card.number ?? null,
    totalSetNumber: card.total_set_number ?? null,
    setName: card.set?.name ?? null,
    setId: card.set?.id ?? null,
    rarity: card.rarity ?? null,
  }));
}

export async function getPkmnPricesCard(id: number, key: string, fetcher: typeof fetch = fetch) {
  const url = new URL(`${BASE_URL}/${id}`);
  url.searchParams.set("currency", "usd");
  const raw = await requestJson(url.toString(), key, fetcher);
  const parsed = cardDetailSchema.safeParse(raw);
  if (!parsed.success) throw new PkmnPricesError(502, "Formato inesperado no detalhe da PkmnPrices.");
  const card = parsed.data;
  return {
    id: card.id,
    name: card.name,
    imageUrl: card.image_url ?? null,
    number: card.number ?? null,
    totalSetNumber: card.total_set_number ?? null,
    setName: card.set?.name ?? null,
    setId: card.set?.id ?? null,
    rarity: card.rarity ?? null,
    prices: card.prices.filter((price) => price.currency.toUpperCase() === "USD" && price.source.toLowerCase() === "tcgplayer").map((price) => ({
      source: "TCGplayer via PkmnPrices",
      currency: "USD" as const,
      condition: price.condition ?? "Não informada",
      variant: price.variant ?? "Não informada",
      marketPrice: price.market_price,
      referenceAt: price.created_at ?? null,
    })),
  };
}
