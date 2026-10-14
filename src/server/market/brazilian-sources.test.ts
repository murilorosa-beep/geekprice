import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchLigaPokemonQuotes,
  fetchLigaMagicQuotes,
  getBrazilianMarketQuotes,
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
    <a href="/?view=cards/card&card=Pikachu+VMAX&ed=VIV&num=044">
      <img data-src="//images.ligapokemon.com.br/cards/pikachu-vmax.jpg" />
      <span>Pikachu VMAX</span>
    </a>
    <div class="price-min">R$ 80,00</div>
    <div class="price-avg">R$ 120,50</div>
    <div class="price-max">R$ 150,00</div>
  </div>
</body>
</html>
`;

describe("brazilian-sources", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchLigaPokemonQuotes", () => {
    it("extrai corretamente cotações, edição e número da Liga Pokémon", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockLigaPokemonHtml, { status: 200 })
      );

      const items = await fetchLigaPokemonQuotes("Pikachu");
      expect(items.length).toBe(2);

      expect(items[0]).toMatchObject({
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
        imageUrl: "https://images.ligapokemon.com.br/cards/pikachu.jpg",
      });

      expect(items[1]).toMatchObject({
        source: "ligapokemon",
        cardTitle: "Pikachu VMAX",
        edition: "VIV",
        collectorNumber: "044",
        priceMin: 80.0,
        priceAvg: 120.5,
        priceMax: 150.0,
      });
    });

    it("retorna lista vazia com tolerância a falhas quando a requisição falhar", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Timeout ou rede indisponível"));

      const items = await fetchLigaPokemonQuotes("Charizard");
      expect(items).toEqual([]);
    });

    it("retorna lista vazia se resposta for HTTP 404/500", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Erro interno", { status: 500 })
      );

      const items = await fetchLigaPokemonQuotes("Mewtwo");
      expect(items).toEqual([]);
    });
  });

  describe("fetchLigaMagicQuotes", () => {
    it("extrai cotações para Magic da Liga Magic", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockLigaPokemonHtml.replace(/ligapokemon/g, "ligamagic"), { status: 200 })
      );

      const items = await fetchLigaMagicQuotes("Black Lotus");
      expect(items.length).toBe(2);
      expect(items[0].source).toBe("ligamagic");
      expect(items[0].sourceLabel).toBe("Liga Magic");
    });
  });

  describe("getBrazilianMarketQuotes", () => {
    it("calcula menor, média e maior preço consolidados em reais", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockLigaPokemonHtml, { status: 200 })
      );

      const result = await getBrazilianMarketQuotes({
        cardName: "Pikachu-consolidation-test",
        game: "pokemon",
        skipCache: true,
      });

      expect(result.totalFound).toBe(2);
      expect(result.lowestPrice).toBe(15.5);
      expect(result.highestPrice).toBe(80.0);
      expect(result.medianPrice).toBe((15.5 + 80.0) / 2);
      expect(result.items.length).toBe(2);
    });

    it("utiliza cache em memória para a mesma busca", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(mockLigaPokemonHtml, { status: 200 })
      );

      const res1 = await getBrazilianMarketQuotes({
        cardName: "CacheTestCard",
        game: "pokemon",
      });
      const res2 = await getBrazilianMarketQuotes({
        cardName: "CacheTestCard",
        game: "pokemon",
      });

      expect(res1.query).toBe(res2.query);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
