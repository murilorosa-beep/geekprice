import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchLigaPokemonQuotes,
  fetchLigaMagicQuotes,
  fetchMypCardsQuotes,
  getBrazilianMarketQuotes,
  signBrazilianQuote,
  verifyBrazilianQuote,
} from "./brazilian-sources";

const mockLigaPokemonHtml = `
<!DOCTYPE html>
<html>
<body>
  <div class="mtg-single">
    <a href="/?view=cards/card&card=Pikachu&ed=151&num=025">
      <img data-src="//images.ligapokemon.com.br/cards/pikachu.jpg" />
      <span>Pikachu</span>
    </a>
    <div class="price-min">R$ 15,50</div>
    <div class="price-avg">R$ 25,00</div>
    <div class="price-max">R$ 40,00</div>
  </div>
  <div class="mtg-single">
    <a href="/?view=cards/card&card=Pikachu&ed=VIV&num=044">
      <img data-src="//images.ligapokemon.com.br/cards/pikachu-viv.jpg" />
      <span>Pikachu</span>
    </a>
    <div class="price-min">R$ 80,00</div>
    <div class="price-avg">R$ 120,50</div>
    <div class="price-max">R$ 150,00</div>
  </div>
</body>
</html>
`;

const mockMypCardsResponse = JSON.stringify({ cards: [
  { card_code: "MEW-025", name_pt: "Pikachu", edition_pt: "151", min_price: "15.50", avg_price: "25.00", max_price: "40.00", link: "https://mypcards.com/pokemon/1" },
  { card_code: "VIV-044", name_pt: "Pikachu", edition_pt: "VIV", min_price: "80.00", avg_price: "120.50", max_price: "150.00", link: "https://mypcards.com/pokemon/2" },
] });

describe("brazilian-sources", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.FEATURE_BRL_SCRAPING_ENABLED;
    delete process.env.MYP_CARDS_API_TOKEN;
  });

  describe("fetchLigaPokemonQuotes", () => {
    it("permanece desabilitado por padrão na ausência da variável FEATURE_BRL_SCRAPING_ENABLED", async () => {
      delete process.env.FEATURE_BRL_SCRAPING_ENABLED;
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const outcome = await fetchLigaPokemonQuotes("Pikachu");
      expect(outcome.status).toBe("disabled_for_commercial");
      expect(outcome.statusMessage).toContain("desabilitada para uso comercial");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("respeita desabilitação comercial explícita via FEATURE_BRL_SCRAPING_ENABLED=false", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "false";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const outcome = await fetchLigaPokemonQuotes("Pikachu");
      expect(outcome.status).toBe("disabled_for_commercial");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("extrai corretamente cotações com tokens assinados pelo servidor quando habilitado", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "true";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockLigaPokemonHtml, { status: 200 })
      );

      const outcome = await fetchLigaPokemonQuotes("Pikachu");
      expect(outcome.status).toBe("ok");
      expect(outcome.items.length).toBe(2);

      const first = outcome.items[0];
      expect(first).toMatchObject({
        source: "ligapokemon",
        sourceLabel: "Liga Pokémon",
        cardTitle: "Pikachu",
        edition: "151",
        collectorNumber: "025",
        priceMin: 15.5,
        priceAvg: 25.0,
        priceMax: 40.0,
        currency: "BRL",
        url: "https://www.ligapokemon.com.br/?view=cards/card&card=Pikachu&ed=151&num=025",
      });
      expect(first.token).toBeDefined();
      expect(typeof first.token).toBe("string");
    });

    it("diferencia bloqueio da fonte (HTTP 403 / 429) como source_blocked", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "true";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Cloudflare Turnstile", { status: 403 })
      );

      const outcome = await fetchLigaPokemonQuotes("Charizard");
      expect(outcome.status).toBe("source_blocked");
      expect(outcome.httpStatus).toBe(403);
      expect(outcome.items).toEqual([]);
    });

    it("diferencia falha de rede/timeout como network_error", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "true";
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

      const outcome = await fetchLigaPokemonQuotes("Mewtwo");
      expect(outcome.status).toBe("network_error");
      expect(outcome.statusMessage).toContain("Tempo limite esgotado");
      expect(outcome.items).toEqual([]);
    });

    it("diferencia alteração de layout HTML quando não encontra mtg-single em página grande", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "true";
      const alteredHtml = "<html><body><main>" + "Conteúdo sem singles ".repeat(200) + "</main></body></html>";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(alteredHtml, { status: 200 })
      );

      const outcome = await fetchLigaPokemonQuotes("Gengar");
      expect(outcome.status).toBe("html_layout_changed");
      expect(outcome.statusMessage).toContain("alterado");
      expect(outcome.items).toEqual([]);
    });

    it("diferencia ausência real de cotações quando a fonte informa zero resultados", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "true";
      const emptyHtml = "<html><body><div>Nenhum registro encontrado para esta busca</div></body></html>";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(emptyHtml, { status: 200 })
      );

      const outcome = await fetchLigaPokemonQuotes("CartaInexistente12345");
      expect(outcome.status).toBe("not_found");
      expect(outcome.items).toEqual([]);
    });
  });

  describe("fetchMypCardsQuotes", () => {
    it("não chama rede quando o token aprovado não foi configurado", async () => {
      delete process.env.MYP_CARDS_API_TOKEN;
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const outcome = await fetchMypCardsQuotes("Charizard ex", "pokemon");
      expect(outcome.status).toBe("access_pending");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("consome o contrato documentado da busca MYP, atribui a fonte e assina a referência", async () => {
      process.env.MYP_CARDS_API_TOKEN = "fixture-token";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ cards: [{
        internal_code: 123, card_code: "SV3-006", name_pt: "Charizard ex", edition_pt: "Ruler of the Black Flame",
        edition_code: "SV3", min_price: "120.00", avg_price: "145.50", max_price: "180.00",
        available_quantity: 4, link: "https://mypcards.com/pokemon/produto/123/charizard-ex",
      }] }), { status: 200, headers: { "content-type": "application/json" } }));
      const outcome = await fetchMypCardsQuotes("Charizard ex", "pokemon", "Ruler of the Black Flame");
      expect(outcome.status).toBe("ok");
      expect(outcome.items[0]).toMatchObject({ source: "mypcards", sourceLabel: "MYP Cards", cardTitle: "Charizard ex", priceMin: 120, priceAvg: 145.5, priceMax: 180, currency: "BRL" });
      expect(outcome.items[0]?.token).toEqual(expect.any(String));
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/pokemon/carta/Charizard%20ex"), expect.objectContaining({ headers: expect.objectContaining({ "X-Api-Token": "fixture-token" }) }));
    });

    it("não inventa número de colecionador quando a API não o documenta", async () => {
      process.env.MYP_CARDS_API_TOKEN = "fixture-token";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ cards: [] }), { status: 200 }));
      const outcome = await fetchMypCardsQuotes("Charizard ex", "pokemon", "SV3", "006");
      expect(outcome.status).toBe("not_found");
      expect(outcome.statusMessage).toContain("não documenta número de colecionador");
    });
  });

  describe("fetchLigaMagicQuotes", () => {
    it("extrai cotações para Magic da Liga Magic quando habilitado", async () => {
      process.env.FEATURE_BRL_SCRAPING_ENABLED = "true";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockLigaPokemonHtml.replace(/ligapokemon/g, "ligamagic"), { status: 200 })
      );

      const outcome = await fetchLigaMagicQuotes("Black Lotus");
      expect(outcome.status).toBe("ok");
      expect(outcome.items.length).toBe(2);
      expect(outcome.items[0].source).toBe("ligamagic");
      expect(outcome.items[0].sourceLabel).toBe("Liga Magic");
    });
  });

  describe("Validação de Tokens e Prevenção de Falsificação", () => {
    it("aceita cotação legítima com token gerado pelo servidor", () => {
      const item = {
        source: "ligapokemon" as const,
        sourceLabel: "Liga Pokémon",
        cardTitle: "Charizard",
        edition: "151",
        collectorNumber: "006",
        priceMin: 200.0,
        priceAvg: 250.0,
        priceMax: 300.0,
        currency: "BRL" as const,
        url: "https://www.ligapokemon.com.br/?view=cards/card&card=Charizard&ed=151&num=006",
        observedAt: new Date().toISOString(),
      };

      const token = signBrazilianQuote(item);
      const verification = verifyBrazilianQuote(token, {
        source: item.source,
        cardTitle: item.cardTitle,
        edition: item.edition,
        collectorNumber: item.collectorNumber,
        price: 250.0,
        url: item.url,
        observedAt: item.observedAt,
      });

      expect(verification).toEqual({ valid: true });
    });

    it("rejeita token ausente ou inválido", () => {
      const verification = verifyBrazilianQuote("", {
        source: "ligapokemon",
        cardTitle: "Charizard",
        price: 250.0,
      });
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain("não fornecido");
    });

    it("rejeita token expirado", () => {
      const expiredTimestamp = Date.now() - 60_000; // 1 minuto no passado
      const expiredToken = `${expiredTimestamp}.abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;

      const verification = verifyBrazilianQuote(expiredToken, {
        source: "ligapokemon",
        cardTitle: "Charizard",
        price: 250.0,
      });
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain("expirou");
    });
  });

  describe("getBrazilianMarketQuotes - Estatísticas sem Misturar Edições", () => {
    it("não mistura edições diferentes no cálculo de menor, mediana e maior preço", async () => {
      process.env.MYP_CARDS_API_TOKEN = "fixture-token";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockMypCardsResponse, { status: 200 })
      );

      // Busca sem especificar edição: o mock tem 1 carta na edição 151 (R$ 15,50 a 40) e 1 carta na VIV (R$ 80 a 150)
      const result = await getBrazilianMarketQuotes({
        cardName: "Pikachu",
        game: "pokemon",
        skipCache: true,
      });

      expect(result.status).toBe("ok");
      expect(result.byEdition.length).toBe(2);

      // Cada edição tem seu próprio cálculo isolado
      const ed151 = result.byEdition.find((g) => g.edition === "151");
      const edVIV = result.byEdition.find((g) => g.edition === "VIV");

      expect(ed151).toBeDefined();
      expect(ed151!.lowestPrice).toBe(15.5);
      expect(ed151!.medianPrice).toBe(15.5);

      expect(edVIV).toBeDefined();
      expect(edVIV!.lowestPrice).toBe(80.0);
      expect(edVIV!.medianPrice).toBe(80.0);

      // A estatística do topo NÃO mistura 15,5 com 80
      expect(result.statsScope).toBe("top_edition_match");
      expect(result.lowestPrice).toBe(ed151!.lowestPrice);
    });

    it("isola estatísticas estritamente para a edição alvo quando especificada", async () => {
      process.env.MYP_CARDS_API_TOKEN = "fixture-token";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockMypCardsResponse, { status: 200 })
      );

      const result = await getBrazilianMarketQuotes({
        cardName: "Pikachu",
        edition: "VIV",
        game: "pokemon",
        skipCache: true,
      });

      expect(result.statsScope).toBe("targeted_edition");
      expect(result.lowestPrice).toBe(80.0);
      expect(result.highestPrice).toBe(80.0);
    });

    it("identifica corretamente se o resultado veio do cache", async () => {
      process.env.MYP_CARDS_API_TOKEN = "fixture-token";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(mockMypCardsResponse, { status: 200 })
      );

      const res1 = await getBrazilianMarketQuotes({
        cardName: "CacheFlagTest",
        game: "pokemon",
      });
      expect(res1.fromCache).toBe(false);

      const res2 = await getBrazilianMarketQuotes({
        cardName: "CacheFlagTest",
        game: "pokemon",
      });
      expect(res2.fromCache).toBe(true);
    });
  });
});
