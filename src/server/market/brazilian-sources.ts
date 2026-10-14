import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type BrazilianQuoteSource = "ligapokemon" | "ligamagic" | "nacional_referencia";

export type BrazilianQuoteItem = {
  source: BrazilianQuoteSource;
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
  token?: string;
};

export type BrazilianQuoteStatus =
  | "ok"
  | "not_found"
  | "network_error"
  | "source_blocked"
  | "html_layout_changed"
  | "disabled_for_commercial";

export type BrazilianQuoteEditionGroup = {
  edition: string;
  count: number;
  lowestPrice: number | null;
  medianPrice: number | null;
  highestPrice: number | null;
  items: BrazilianQuoteItem[];
};

export type BrazilianQuoteResult = {
  query: string;
  game: "pokemon" | "magic";
  searchedAt: string;
  collectedAt: string;
  fromCache: boolean;
  status: BrazilianQuoteStatus;
  statusMessage: string;
  targetEdition?: string;
  targetCollectorNumber?: string;
  totalFound: number;
  lowestPrice: number | null;
  medianPrice: number | null;
  highestPrice: number | null;
  statsScope: "targeted_edition" | "top_edition_match" | "none";
  items: BrazilianQuoteItem[];
  byEdition: BrazilianQuoteEditionGroup[];
  commercialNotice?: string;
};

export type FetchQuotesOutcome = {
  status: BrazilianQuoteStatus;
  statusMessage: string;
  items: BrazilianQuoteItem[];
  httpStatus?: number;
  observedAt: string;
};

// Cache reduzido para 15 minutos (evita desatualização e nunca rotula cache antigo como "tempo real")
const cache = new Map<string, { data: BrazilianQuoteResult; expiresAt: number; cachedAt: string }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function getSignatureSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET é obrigatório para assinar cotações.");
    }
    return "gp_dev_brl_quote_secret_fallback_2026";
  }
  return secret;
}

/**
 * Assina criptograficamente a cotação retornada pelo servidor.
 * Impede que requisições POST enviem cotações adulteradas ou preços inventados pelo cliente.
 */
export function signBrazilianQuote(item: Omit<BrazilianQuoteItem, "token">): string {
  const expiresAt = Date.now() + 15 * 60 * 1000; // Validade estrita de 15 minutos
  const minCents = Math.round(item.priceMin * 100);
  const avgCents = Math.round(item.priceAvg * 100);
  const maxCents = Math.round(item.priceMax * 100);

  const payload = [
    item.source,
    item.cardTitle.trim().toLowerCase(),
    (item.edition ?? "").trim().toLowerCase(),
    (item.collectorNumber ?? "").trim().toLowerCase(),
    minCents,
    avgCents,
    maxCents,
    item.currency,
    item.url,
    item.observedAt,
    expiresAt,
  ].join("|");

  const hmac = createHmac("sha256", getSignatureSecret()).update(payload).digest("hex");
  return `${expiresAt}.${minCents}.${avgCents}.${maxCents}.${hmac}`;
}

/**
 * Valida a assinatura de uma cotação antes de aceitar a gravação no estoque.
 */
export function verifyBrazilianQuote(
  token: string,
  quote: {
    source: string;
    cardTitle: string;
    edition?: string;
    collectorNumber?: string;
    price: number;
    priceMin?: number;
    priceAvg?: number;
    priceMax?: number;
    url?: string;
    observedAt?: string;
  }
): { valid: boolean; reason?: string } {
  if (!token) {
    return { valid: false, reason: "Token de assinatura de cotação não fornecido." };
  }

  const parts = token.split(".");
  const secret = getSignatureSecret();

  if (parts.length === 5) {
    const expiresAt = Number(parts[0]);
    const minCents = Number(parts[1]);
    const avgCents = Number(parts[2]);
    const maxCents = Number(parts[3]);
    const sig = parts[4];

    if (
      !Number.isSafeInteger(expiresAt) ||
      !Number.isSafeInteger(minCents) ||
      !Number.isSafeInteger(avgCents) ||
      !Number.isSafeInteger(maxCents)
    ) {
      return { valid: false, reason: "Formato de token de cotação inválido." };
    }

    if (expiresAt < Date.now()) {
      return {
        valid: false,
        reason: "Esta cotação expirou (validade máxima de 15 minutos). Atualize a consulta antes de vincular.",
      };
    }

    const expectedSigBuf = Buffer.from(sig, "hex");
    if (expectedSigBuf.length !== 32) {
      return { valid: false, reason: "Assinatura do token com tamanho inválido." };
    }

    const payload = [
      quote.source,
      quote.cardTitle.trim().toLowerCase(),
      (quote.edition ?? "").trim().toLowerCase(),
      (quote.collectorNumber ?? "").trim().toLowerCase(),
      minCents,
      avgCents,
      maxCents,
      "BRL",
      quote.url ?? "",
      quote.observedAt ?? "",
      expiresAt,
    ].join("|");

    const candidateSig = createHmac("sha256", secret).update(payload).digest("hex");
    const candidateBuf = Buffer.from(candidateSig, "hex");
    if (candidateBuf.length !== expectedSigBuf.length || !timingSafeEqual(candidateBuf, expectedSigBuf)) {
      return { valid: false, reason: "Assinatura do token inválida ou cotação adulterada." };
    }

    const minVal = minCents / 100;
    const avgVal = avgCents / 100;
    const maxVal = maxCents / 100;
    const price = quote.price;

    const matchesPrice =
      Math.abs(price - minVal) < 0.01 ||
      Math.abs(price - avgVal) < 0.01 ||
      Math.abs(price - maxVal) < 0.01 ||
      (price >= minVal - 0.01 && price <= maxVal + 0.01);

    if (!matchesPrice) {
      return {
        valid: false,
        reason: "O preço selecionado não corresponde aos valores verificados no servidor para esta cotação.",
      };
    }

    return { valid: true };
  }

  if (parts.length === 2) {
    const expiresAt = Number(parts[0]);
    const sig = parts[1];

    if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) {
      return {
        valid: false,
        reason: "Esta cotação expirou (validade máxima de 15 minutos). Atualize a consulta antes de vincular.",
      };
    }

    const expectedSigBuf = Buffer.from(sig, "hex");
    if (expectedSigBuf.length !== 32) {
      return { valid: false, reason: "Assinatura do token com tamanho inválido." };
    }

    const candidatePrices: [number, number, number][] = [
      [
        Math.round((quote.priceMin ?? quote.price) * 100),
        Math.round((quote.priceAvg ?? quote.price) * 100),
        Math.round((quote.priceMax ?? quote.price) * 100),
      ],
      [
        Math.round(quote.price * 100),
        Math.round(quote.price * 100),
        Math.round(quote.price * 100),
      ],
    ];

    let matchFound = false;
    for (const [cMin, cAvg, cMax] of candidatePrices) {
      const payload = [
        quote.source,
        quote.cardTitle.trim().toLowerCase(),
        (quote.edition ?? "").trim().toLowerCase(),
        (quote.collectorNumber ?? "").trim().toLowerCase(),
        cMin,
        cAvg,
        cMax,
        "BRL",
        quote.url ?? "",
        quote.observedAt ?? "",
        expiresAt,
      ].join("|");

      const candidateSig = createHmac("sha256", secret).update(payload).digest("hex");
      const candidateBuf = Buffer.from(candidateSig, "hex");
      if (candidateBuf.length === expectedSigBuf.length && timingSafeEqual(candidateBuf, expectedSigBuf)) {
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      return { valid: false, reason: "Assinatura do token inválida ou cotação adulterada." };
    }

    return { valid: true };
  }

  return { valid: false, reason: "Formato de token de cotação inválido." };
}

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

export function isBrlScrapingEnabled(): boolean {
  return process.env.FEATURE_BRL_SCRAPING_ENABLED === "true";
}

/**
 * Consulta a Liga Pokémon diferenciando falha de rede, bloqueio e mudança de HTML.
 */
export async function fetchLigaPokemonQuotes(
  cardName: string,
  edition?: string,
  collectorNumber?: string
): Promise<FetchQuotesOutcome> {
  const cleanName = cardName.trim();
  const now = new Date().toISOString();

  if (!cleanName) {
    return {
      status: "not_found",
      statusMessage: "Nome da carta não informado.",
      items: [],
      observedAt: now,
    };
  }

  // Verificação de autorização comercial (Desabilitado por padrão se ausente ou false)
  if (!isBrlScrapingEnabled()) {
    return {
      status: "disabled_for_commercial",
      statusMessage:
        "A coleta externa automatizada de anúncios da Liga Pokémon está desabilitada para uso comercial. Utilize a importação de planilhas homologadas (BRL CSV) ou habilite FEATURE_BRL_SCRAPING_ENABLED=true sob autorização.",
      items: [],
      observedAt: now,
    };
  }

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

    if (res.status === 403 || res.status === 429) {
      return {
        status: "source_blocked",
        statusMessage: `Acesso temporariamente bloqueado pela Liga Pokémon (HTTP ${res.status}: Cloudflare ou taxa de limite). Tente mais tarde ou use importação manual.`,
        httpStatus: res.status,
        items: [],
        observedAt: now,
      };
    }

    if (!res.ok) {
      return {
        status: "network_error",
        statusMessage: `A Liga Pokémon respondeu com erro HTTP ${res.status}.`,
        httpStatus: res.status,
        items: [],
        observedAt: now,
      };
    }

    const html = await res.text();

    // Detecção de ausência real de cotações
    if (
      html.includes("Nenhum registro encontrado") ||
      html.includes("Nenhuma carta encontrada") ||
      html.includes("nenhum produto encontrado")
    ) {
      return {
        status: "not_found",
        statusMessage: `Nenhuma carta encontrada na Liga Pokémon para "${cleanName}".`,
        items: [],
        observedAt: now,
      };
    }

    const singles = html.split('<div class="mtg-single">').slice(1);

    // Se o HTML tem tamanho substancial mas não contém a classe mtg-single e nem mensagem de não-encontrado,
    // o layout do site pode ter mudado.
    if (singles.length === 0 && html.length > 2500) {
      return {
        status: "html_layout_changed",
        statusMessage:
          "O formato das páginas da Liga Pokémon parece ter sido alterado. Não foi possível extrair a lista de produtos.",
        items: [],
        observedAt: now,
      };
    }

    const results: BrazilianQuoteItem[] = [];

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

        const quoteRaw: Omit<BrazilianQuoteItem, "token"> = {
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
        };

        const token = signBrazilianQuote(quoteRaw);

        results.push({
          ...quoteRaw,
          token,
        });
      }
    }

    // Se haviam blocos de singles no HTML mas nenhum preço pôde ser extraído, layout mudou
    if (singles.length > 0 && results.length === 0) {
      return {
        status: "html_layout_changed",
        statusMessage:
          "A estrutura interna dos cards na Liga Pokémon mudou; nenhum preço pôde ser extraído.",
        items: [],
        observedAt: now,
      };
    }

    if (results.length === 0) {
      return {
        status: "not_found",
        statusMessage: `Nenhum anúncio com preço ativo para "${cleanName}".`,
        items: [],
        observedAt: now,
      };
    }

    // Prioriza ordenação se informou edição ou número
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

    return {
      status: "ok",
      statusMessage: `${results.length} cotação(ões) encontrada(s) na Liga Pokémon.`,
      items: results,
      observedAt: now,
    };
  } catch (err: unknown) {
    const isTimeout =
      (err as { name?: string })?.name === "AbortError" ||
      String(err).includes("aborted");

    return {
      status: "network_error",
      statusMessage: isTimeout
        ? "Tempo limite esgotado ao contatar a Liga Pokémon (timeout de 8s). Tente novamente."
        : `Falha de rede ao consultar a Liga Pokémon: ${(err as Error)?.message || "Erro desconhecido"}`,
      items: [],
      observedAt: now,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Consulta a Liga Magic diferenciando falha de rede, bloqueio e mudança de HTML.
 */
export async function fetchLigaMagicQuotes(
  cardName: string,
  edition?: string,
  collectorNumber?: string
): Promise<FetchQuotesOutcome> {
  const cleanName = cardName.trim();
  const now = new Date().toISOString();

  if (!cleanName) {
    return {
      status: "not_found",
      statusMessage: "Nome da carta não informado.",
      items: [],
      observedAt: now,
    };
  }

  if (!isBrlScrapingEnabled()) {
    return {
      status: "disabled_for_commercial",
      statusMessage:
        "A coleta externa automatizada de anúncios da Liga Magic está desabilitada para uso comercial. Utilize a importação de planilhas homologadas (BRL CSV) ou habilite FEATURE_BRL_SCRAPING_ENABLED=true sob autorização.",
      items: [],
      observedAt: now,
    };
  }

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

    if (res.status === 403 || res.status === 429) {
      return {
        status: "source_blocked",
        statusMessage: `Acesso bloqueado pela Liga Magic (HTTP ${res.status}).`,
        httpStatus: res.status,
        items: [],
        observedAt: now,
      };
    }

    if (!res.ok) {
      return {
        status: "network_error",
        statusMessage: `A Liga Magic respondeu com erro HTTP ${res.status}.`,
        httpStatus: res.status,
        items: [],
        observedAt: now,
      };
    }

    const html = await res.text();
    const singles = html.split('<div class="mtg-single">').slice(1);

    if (singles.length === 0 && html.length > 2500) {
      return {
        status: "html_layout_changed",
        statusMessage: "Estrutura HTML da Liga Magic alterada; formato não reconhecido.",
        items: [],
        observedAt: now,
      };
    }

    const results: BrazilianQuoteItem[] = [];

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

        const quoteRaw: Omit<BrazilianQuoteItem, "token"> = {
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
        };

        results.push({
          ...quoteRaw,
          token: signBrazilianQuote(quoteRaw),
        });
      }
    }

    if (results.length === 0) {
      return {
        status: "not_found",
        statusMessage: `Nenhuma cotação localizada para "${cleanName}" na Liga Magic.`,
        items: [],
        observedAt: now,
      };
    }

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

    return {
      status: "ok",
      statusMessage: `${results.length} cotação(ões) encontrada(s) na Liga Magic.`,
      items: results,
      observedAt: now,
    };
  } catch (err: unknown) {
    const isTimeout =
      (err as { name?: string })?.name === "AbortError" ||
      String(err).includes("aborted");

    return {
      status: "network_error",
      statusMessage: isTimeout
        ? "Tempo limite esgotado ao contatar a Liga Magic (timeout 8s)."
        : `Falha de rede na Liga Magic: ${(err as Error)?.message || "Erro desconhecido"}`,
      items: [],
      observedAt: now,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calcula estatísticas financeiras de forma isolada para um conjunto homogêneo de cartas (mesma edição).
 * NUNCA mistura edições diferentes em um único cálculo de menor, média ou maior preço.
 */
function calculateGroupStats(items: BrazilianQuoteItem[]): {
  lowestPrice: number | null;
  medianPrice: number | null;
  highestPrice: number | null;
} {
  const validMins = items.map((i) => i.priceMin).filter((p) => p > 0);
  if (validMins.length === 0) {
    return { lowestPrice: null, medianPrice: null, highestPrice: null };
  }

  const lowestPrice = Math.min(...validMins);
  const highestPrice = Math.max(...validMins);

  const sorted = [...validMins].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianPrice =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return { lowestPrice, medianPrice, highestPrice };
}

/**
 * Consulta cotações do mercado brasileiro de forma segura, agregando exclusivamente por edição.
 */
export async function getBrazilianMarketQuotes(params: {
  cardName: string;
  game?: "pokemon" | "magic";
  edition?: string;
  collectorNumber?: string;
  skipCache?: boolean;
}): Promise<BrazilianQuoteResult> {
  const game = params.game ?? "pokemon";
  const now = new Date().toISOString();
  const cacheKey = `${game}:${params.cardName.toLowerCase().trim()}:${(params.edition ?? "").toLowerCase().trim()}:${(params.collectorNumber ?? "").trim()}`;

  if (!params.skipCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.data,
        fromCache: true,
        searchedAt: now,
      };
    }
  }

  let outcome: FetchQuotesOutcome;

  if (game === "pokemon") {
    outcome = await fetchLigaPokemonQuotes(params.cardName, params.edition, params.collectorNumber);
  } else {
    outcome = await fetchLigaMagicQuotes(params.cardName, params.edition, params.collectorNumber);
  }

  const items = outcome.items;

  // Agrupamento estrito por edição (Requirement 3: NUNCA misturar edições diferentes)
  const editionMap = new Map<string, BrazilianQuoteItem[]>();

  for (const item of items) {
    const edKey = item.edition ? item.edition.trim() : "Edição Não Informada";
    const existing = editionMap.get(edKey) ?? [];
    existing.push(item);
    editionMap.set(edKey, existing);
  }

  const byEdition: BrazilianQuoteEditionGroup[] = [];
  for (const [editionName, groupItems] of editionMap.entries()) {
    const stats = calculateGroupStats(groupItems);
    byEdition.push({
      edition: editionName,
      count: groupItems.length,
      lowestPrice: stats.lowestPrice,
      medianPrice: stats.medianPrice,
      highestPrice: stats.highestPrice,
      items: groupItems,
    });
  }

  // Ordena grupos: se uma edição específica foi solicitada, ela fica no topo
  if (params.edition) {
    byEdition.sort((a, b) => {
      const matchA = a.edition.toLowerCase() === params.edition!.toLowerCase() ? 1 : 0;
      const matchB = b.edition.toLowerCase() === params.edition!.toLowerCase() ? 1 : 0;
      return matchB - matchA;
    });
  }

  // Determina estatísticas no nível raiz:
  // Se informou edição, calcula estritamente sobre a edição alvo.
  // Se não informou, utiliza o grupo mais relevante (o primeiro do topo), NUNCA misturando todas as edições!
  let lowestPrice: number | null = null;
  let medianPrice: number | null = null;
  let highestPrice: number | null = null;
  let statsScope: "targeted_edition" | "top_edition_match" | "none" = "none";

  if (params.edition && byEdition.length > 0 && byEdition[0].edition.toLowerCase() === params.edition.toLowerCase()) {
    lowestPrice = byEdition[0].lowestPrice;
    medianPrice = byEdition[0].medianPrice;
    highestPrice = byEdition[0].highestPrice;
    statsScope = "targeted_edition";
  } else if (byEdition.length > 0) {
    // Estatísticas da edição líder (mais relevante), mantendo pureza estatística
    lowestPrice = byEdition[0].lowestPrice;
    medianPrice = byEdition[0].medianPrice;
    highestPrice = byEdition[0].highestPrice;
    statsScope = "top_edition_match";
  }

  const commercialNotice = !isBrlScrapingEnabled()
    ? "Coleta externa pública desabilitada por padrão para conformidade comercial. Utilize importação de cotações homologadas ou habilite FEATURE_BRL_SCRAPING_ENABLED=true sob autorização."
    : "Aviso: Referência extraída de anúncios públicos (não homologada oficialmente). Requer conferência manual.";

  const result: BrazilianQuoteResult = {
    query: params.cardName,
    game,
    searchedAt: now,
    collectedAt: outcome.observedAt,
    fromCache: false,
    status: outcome.status,
    statusMessage: outcome.statusMessage,
    targetEdition: params.edition,
    targetCollectorNumber: params.collectorNumber,
    totalFound: items.length,
    lowestPrice,
    medianPrice,
    highestPrice,
    statsScope,
    items,
    byEdition,
    commercialNotice,
  };

  if (outcome.status === "ok") {
    cache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
      cachedAt: now,
    });
  }

  return result;
}
