import { describe, expect, it, vi } from "vitest";
import { getPkmnPricesCard, PkmnPricesError, searchPkmnPrices, searchPkmnPricesSets } from "./pkmnprices-client";

describe("PkmnPrices", () => {
  it("limita a busca gratuita a cinco cartas em inglês e envia a chave só no cabeçalho", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 42, name: "Charizard", number: "4", set: { id: 1, name: "Base Set" } }] }), { status: 200 }));
    const cards = await searchPkmnPrices({ name: "Charizard" }, "test-secret", fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain("language=English");
    expect(url).toContain("per_page=10");
    expect(url).not.toContain("test-secret");
    expect(init.headers["X-API-Key"]).toBe("test-secret");
    expect(cards).toEqual([{ id: 42, name: "Charizard", imageUrl: null, number: "4", totalSetNumber: null, setName: "Base Set", setId: 1, rarity: null }]);
  });

  it("preserva condição e variante e descarta preços que não são USD/TCGplayer", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 42, name: "Charizard", set: { id: 1, name: "Base Set" },
      prices: [
        { source: "tcgplayer", currency: "USD", condition: "Near Mint", variant: "Holofoil", market_price: 120, created_at: "2026-10-14T00:00:00Z" },
        { source: "cardmarket", currency: "EUR", condition: "Near Mint", variant: "Holofoil", market_price: 100 },
      ],
    }), { status: 200 }));
    const card = await getPkmnPricesCard(42, "test-secret", fetcher);
    expect(card.prices).toEqual([{ source: "TCGplayer via PkmnPrices", currency: "USD", condition: "Near Mint", variant: "Holofoil", marketPrice: 120, referenceAt: "2026-10-14T00:00:00Z" }]);
  });

  it("informa quando o limite da API é atingido", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    await expect(searchPkmnPrices({ name: "Charizard" }, "test-secret", fetcher)).rejects.toMatchObject({ status: 429 } satisfies Partial<PkmnPricesError>);
  });

  it("filtra número e coleção exatos antes de mostrar uma carta", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 1, name: "Charizard ex", number: "010", set: { id: 30, name: "Outra coleção" } },
      { id: 2, name: "Charizard ex", number: "010", set: { id: 20, name: "Coleção correta" } },
      { id: 3, name: "Charizard ex", number: "110", set: { id: 20, name: "Coleção correta" } },
    ] }), { status: 200 }));
    const cards = await searchPkmnPrices({ name: "Charizard ex", number: "010/072", setId: 20 }, "test-secret", fetcher);
    expect(cards.map((card) => card.id)).toEqual([2]);
    expect(fetcher.mock.calls[0][0]).toContain("set_id=20");
  });

  it("busca coleções inglesas por nome sem expor a chave", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 12, name: "Obsidian Flames", language: "English", card_count: 230 }] }), { status: 200 }));
    const sets = await searchPkmnPricesSets("Obsidian", "test-secret", fetcher);
    expect(sets[0].name).toBe("Obsidian Flames");
    expect(fetcher.mock.calls[0][0]).toContain("/v1/sets?");
  });
});
