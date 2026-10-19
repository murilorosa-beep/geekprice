import { z } from "zod";
import type { CatalogConnector, ExternalCard, ExternalPrice } from "./types";

const summarySchema = z.object({ id: z.string(), localId: z.string().optional(), name: z.string(), image: z.string().optional() }).passthrough();
const detailSchema = summarySchema.extend({
  rarity: z.string().optional(),
  set: z.object({ id: z.string().optional(), name: z.string().optional() }).passthrough().optional(),
  variants: z.record(z.string(), z.boolean()).optional(),
  pricing: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export class ConnectorHttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function fetchWithRetry(url: string, attempts = 3, fetcher: typeof fetch = fetch): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(url, { headers: { Accept: "application/json", "User-Agent": "GeekPrice/0.1" }, signal: AbortSignal.timeout(8_000), next: { revalidate: 3600 } });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) throw new ConnectorHttpError(response.status, `TCGdex respondeu HTTP ${response.status}.`);
      last = new ConnectorHttpError(response.status, `TCGdex temporariamente indisponível (HTTP ${response.status}).`);
    } catch (error) { last = error; if (error instanceof ConnectorHttpError && error.status < 500 && error.status !== 429) throw error; }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw last instanceof Error ? last : new Error("Falha ao consultar a TCGdex.");
}

function lang(value: string) { return ["en", "fr", "de", "it", "es", "pt-br", "ja", "zh-tw", "id", "ko", "th"].includes(value.toLowerCase()) ? value.toLowerCase() : "pt-br"; }
function cardUrl(language: string, id: string) { return `https://api.tcgdex.net/v2/${lang(language)}/cards/${encodeURIComponent(id)}`; }
function imageUrl(value?: string) { return value ? `${value}/high.webp` : null; }
function finishes(variants?: Record<string, boolean>) { return Object.entries(variants ?? {}).filter(([, enabled]) => enabled).map(([key]) => key); }

function mapPrices(pricing: Record<string, unknown> | undefined, cardId: string): ExternalPrice[] {
  const result: ExternalPrice[] = [];
  const walk = (value: unknown, path: string[], market: string, currency: "USD" | "EUR", updated?: Date) => {
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const nextUpdated = typeof object.updated === "string" && !Number.isNaN(Date.parse(object.updated)) ? new Date(object.updated) : updated;
    for (const [key, child] of Object.entries(object)) {
      if (typeof child === "number" && child >= 0 && ["marketPrice", "trend", "avg", "low"].includes(key)) {
        const finish = path.find((part) => /normal|reverse|holo|first|unlimited/i.test(part)) ?? "standard";
        result.push({ externalVariantId: `${cardId}:${market}:${path.join("-") || "base"}:${key}`, sourceMarket: market, currency, price: child, finish, condition: null, referenceAt: nextUpdated ?? new Date(), url: null, raw: object });
      } else if (child && typeof child === "object") walk(child, [...path, key], market, currency, nextUpdated);
    }
  };
  for (const [market, value] of Object.entries(pricing ?? {})) {
    if (/cardmarket/i.test(market)) walk(value, [], "Cardmarket via TCGdex", "EUR");
    if (/tcgplayer/i.test(market)) walk(value, [], "TCGplayer via TCGdex", "USD");
  }
  return result;
}

function mapCard(raw: z.infer<typeof detailSchema>, language: string): ExternalCard {
  return { id: raw.id, name: raw.name, localId: raw.localId ?? null, setId: raw.set?.id ?? null, setName: raw.set?.name ?? null, rarity: raw.rarity ?? null, image: imageUrl(raw.image), language: lang(language), finishes: finishes(raw.variants) };
}

export const tcgdexConnector: CatalogConnector = {
  id: "tcgdex",
  async search(input) {
    const params = new URLSearchParams();
    if (input.name) params.set("name", input.name);
    if (input.set) params.set("set.name", input.set);
    if (input.number) params.set("localId", input.number);
    params.set("pagination:itemsPerPage", String(Math.min(input.limit ?? 20, 50)));
    const languages = lang(input.language) === "en" ? ["en"] : [lang(input.language), "en"];
    const results = await Promise.all(languages.map(async (language) => {
      try {
        const response = await fetchWithRetry(`https://api.tcgdex.net/v2/${language}/cards?${params}`);
        const rows = z.array(summarySchema).parse(await response.json());
        return rows.map((row) => ({ ...mapCard(row, language), rarity: null, setId: null, setName: null, finishes: [] }));
      } catch (error) {
        if (error instanceof ConnectorHttpError && error.status === 404) return [];
        throw error;
      }
    }));
    // Older printings are absent from some localized catalogs. Preserve the actual
    // catalog language when supplementing results; never label English cards PT.
    const byId = new Map<string, ExternalCard>();
    for (const card of results.flat()) if (!byId.has(card.id)) byId.set(card.id, card);
    return [...byId.values()].slice(0, input.limit ?? 30);
  },
  async getCard(id, language) {
    let resolvedLanguage = lang(language);
    let response: Response;
    try {
      response = await fetchWithRetry(cardUrl(resolvedLanguage, id));
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 404 && resolvedLanguage !== "en") {
        resolvedLanguage = "en";
        response = await fetchWithRetry(cardUrl(resolvedLanguage, id));
      } else {
        throw error;
      }
    }
    const raw = detailSchema.parse(await response.json());
    return { ...mapCard(raw, resolvedLanguage), prices: mapPrices(raw.pricing, raw.id) };
  },
};
