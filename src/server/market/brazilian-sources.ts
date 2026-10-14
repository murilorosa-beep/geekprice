import "server-only";

export type BrazilianQuoteItem = {
  source: "ligapokemon" | "ligamagic" | "nacional_referencia";
  sourceLabel: string;
  cardTitle: string;
  edition?: string;
  collectorNumber?: string;
  priceMin: number;
  priceAvg: number;
  priceMax: number;
  currency: "BRL";
  url: string;
  imageUrl?: string;
  observedAt: string;
};

export type BrazilianQuoteResult = {
  query: string;
  game: "pokemon" | "magic";
  searchedAt: string;
  totalFound: number;
  lowestPrice: number | null;
  medianPrice: number | null;
  highestPrice: number | null;
  items: BrazilianQuoteItem[];
};

// Cache simples em memória com TTL de 12 horas para evitar sobrecarga de requisições
const cache = new Map<string, { data: BrazilianQuoteResult; expiresAt: number }>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function parseBrlMoney(raw?: string | null): number {
  if (!raw) return 0;
  const clean = raw
    .replace(/<[^>]+>/g, "")
    .replace(/[^\d,\.]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const val = Number(clean);
  return Number.isFinite(val) ? val : 0;
}

export async function fetchLigaPokemonQuotes(
  cardName: string,
  edition?: string,
  collectorNumber?: string
): Promise<BrazilianQuoteItem[]> {
  const cleanName = cardName.trim();
  if (!cleanName) return [];

  const url = `https://www.ligapokemon.com.br/?view=cards/card&card=${encodeURIComponent(cleanName)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const singles = html.split('<div class="mtg-single">').slice(1);
    const results: BrazilianQuoteItem[] = [];

    const now = new Date().toISOString();

    for (const block of singles) {
      const linkMatch = block.match(
        /<a[^>]*href="([^"]*(?:cards\/card|prod\/view)[^"]*)"[^>]*>([\s\S]*?)<\/a>/
      );
      const minMatch = block.match(/class="price-min">([\s\S]*?)<\/div>/);
      const avgMatch = block.match(/class="price-avg">([\s\S]*?)<\/div>/);
      const maxMatch = block.match(/class="price-max">([\s\S]*?)<\/div>/);
      const imgMatch = block.match(/data-src="([^"]+)"/);

      if (linkMatch && minMatch) {
        const href = linkMatch[1];
        let title = linkMatch[2].replace(/<[^>]+>/g, "").trim();

        // Extrai dados da URL caso o texto interno da tag esteja vazio
        const cardParam = href.match(/[?&]card=([^&]+)/);
        const prodParam = href.match(/[?&]prod=([^&]+)/);
        const edParam = href.match(/[?&]ed=([^&]+)/);
        const numParam = href.match(/[?&]num=([^&]+)/);

        if (!title && cardParam) {
          title = decodeURIComponent(cardParam[1]).replace(/\+/g, " ");
        } else if (!title && prodParam) {
          title = decodeURIComponent(prodParam[1]).replace(/\+/g, " ");
        }

        const min = parseBrlMoney(minMatch[1]);
        const avg = parseBrlMoney(avgMatch?.[1]) || min;
        const max = parseBrlMoney(maxMatch?.[1]) || avg;

        if (min <= 0 && avg <= 0) continue;

        const cardEdition = edParam ? decodeURIComponent(edParam[1]) : undefined;
        const cardNum = numParam ? decodeURIComponent(numParam[1]) : undefined;

        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.ligapokemon.com.br${href.startsWith("/") ? "" : "/"}${href}`;

        results.push({
          source: "ligapokemon",
          sourceLabel: "Liga Pokémon",
          cardTitle: title || cleanName,
          edition: cardEdition,
          collectorNumber: cardNum,
          priceMin: min,
          priceAvg: avg,
          priceMax: max,
          currency: "BRL",
          url: fullUrl,
          imageUrl: imgMatch
            ? imgMatch[1].startsWith("//")
              ? `https:${imgMatch[1]}`
              : imgMatch[1]
            : undefined,
          observedAt: now,
        });
      }
    }

    // Se informou edição ou número, prioriza os mais próximos
    if (edition || collectorNumber) {
      results.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        if (edition && a.edition?.toLowerCase() === edition.toLowerCase()) scoreA += 5;
        if (edition && b.edition?.toLowerCase() === edition.toLowerCase()) scoreB += 5;
        if (collectorNumber && a.collectorNumber === collectorNumber) scoreA += 5;
        if (collectorNumber && b.collectorNumber === collectorNumber) scoreB += 5;
        return scoreB - scoreA;
      });
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchLigaMagicQuotes(
  cardName: string,
  edition?: string,
  collectorNumber?: string
): Promise<BrazilianQuoteItem[]> {
  const cleanName = cardName.trim();
  if (!cleanName) return [];

  const url = `https://www.ligamagic.com.br/?view=cards/card&card=${encodeURIComponent(cleanName)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const singles = html.split('<div class="mtg-single">').slice(1);
    const results: BrazilianQuoteItem[] = [];
    const now = new Date().toISOString();

    for (const block of singles) {
      const linkMatch = block.match(
        /<a[^>]*href="([^"]*(?:cards\/card|prod\/view)[^"]*)"[^>]*>([\s\S]*?)<\/a>/
      );
      const minMatch = block.match(/class="price-min">([\s\S]*?)<\/div>/);
      const avgMatch = block.match(/class="price-avg">([\s\S]*?)<\/div>/);
      const maxMatch = block.match(/class="price-max">([\s\S]*?)<\/div>/);
      const imgMatch = block.match(/data-src="([^"]+)"/);

      if (linkMatch && minMatch) {
        const href = linkMatch[1];
        let title = linkMatch[2].replace(/<[^>]+>/g, "").trim();

        const cardParam = href.match(/[?&]card=([^&]+)/);
        const edParam = href.match(/[?&]ed=([^&]+)/);
        const numParam = href.match(/[?&]num=([^&]+)/);

        if (!title && cardParam) {
          title = decodeURIComponent(cardParam[1]).replace(/\+/g, " ");
        }

        const min = parseBrlMoney(minMatch[1]);
        const avg = parseBrlMoney(avgMatch?.[1]) || min;
        const max = parseBrlMoney(maxMatch?.[1]) || avg;

        if (min <= 0 && avg <= 0) continue;

        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.ligamagic.com.br${href.startsWith("/") ? "" : "/"}${href}`;

        results.push({
          source: "ligamagic",
          sourceLabel: "Liga Magic",
          cardTitle: title || cleanName,
          edition: edParam ? decodeURIComponent(edParam[1]) : undefined,
          collectorNumber: numParam ? decodeURIComponent(numParam[1]) : undefined,
          priceMin: min,
          priceAvg: avg,
          priceMax: max,
          currency: "BRL",
          url: fullUrl,
          imageUrl: imgMatch
            ? imgMatch[1].startsWith("//")
              ? `https:${imgMatch[1]}`
              : imgMatch[1]
            : undefined,
          observedAt: now,
        });
      }
    }

    // Se informou edição ou número, prioriza os mais próximos
    if (edition || collectorNumber) {
      results.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        if (edition && a.edition?.toLowerCase() === edition.toLowerCase()) scoreA += 5;
        if (edition && b.edition?.toLowerCase() === edition.toLowerCase()) scoreB += 5;
        if (collectorNumber && a.collectorNumber === collectorNumber) scoreA += 5;
        if (collectorNumber && b.collectorNumber === collectorNumber) scoreB += 5;
        return scoreB - scoreA;
      });
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getBrazilianMarketQuotes(params: {
  cardName: string;
  game?: "pokemon" | "magic";
  edition?: string;
  collectorNumber?: string;
  skipCache?: boolean;
}): Promise<BrazilianQuoteResult> {
  const game = params.game ?? "pokemon";
  const cacheKey = `${game}:${params.cardName.toLowerCase().trim()}:${(params.edition ?? "").toLowerCase()}:${params.collectorNumber ?? ""}`;

  if (!params.skipCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  let items: BrazilianQuoteItem[] = [];

  if (game === "pokemon") {
    items = await fetchLigaPokemonQuotes(params.cardName, params.edition, params.collectorNumber);
  } else if (game === "magic") {
    items = await fetchLigaMagicQuotes(params.cardName, params.edition, params.collectorNumber);
  }

  // Calcula estatísticas consolidadas
  const validMins = items.map((i) => i.priceMin).filter((p) => p > 0);
  const lowestPrice = validMins.length ? Math.min(...validMins) : null;
  const highestPrice = validMins.length ? Math.max(...validMins) : null;

  let medianPrice: number | null = null;
  if (validMins.length > 0) {
    const sorted = [...validMins].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianPrice = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const result: BrazilianQuoteResult = {
    query: params.cardName,
    game,
    searchedAt: new Date().toISOString(),
    totalFound: items.length,
    lowestPrice,
    medianPrice,
    highestPrice,
    items,
  };

  cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

  return result;
}
