import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WooCommerceConnector } from "./woocommerce";

describe("Conector WooCommerce REST API v3", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exige URL e chaves válidas na instanciação", () => {
    expect(
      () =>
        new WooCommerceConnector({
          storeUrl: "",
          consumerKey: "ck_123",
          consumerSecret: "cs_123",
        })
    ).toThrow("URL da loja");

    expect(
      () =>
        new WooCommerceConnector({
          storeUrl: "https://loja.com",
          consumerKey: "",
          consumerSecret: "cs_123",
        })
    ).toThrow("Consumer Key");
  });

  it("exige HTTPS estrito em ambiente de produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      () =>
        new WooCommerceConnector({
          storeUrl: "http://loja-insegura.com.br",
          consumerKey: "ck_123",
          consumerSecret: "cs_123",
        })
    ).toThrow("devem utilizar HTTPS");
  });

  it("processa produtos, preços e atributos TCG com segurança a partir da API", async () => {
    const mockProducts = [
      {
        id: 101,
        name: "Charizard ex (Special Illustration Rare)",
        sku: "POK-OBF-223",
        price: "450.00",
        regular_price: "480.00",
        manage_stock: true,
        stock_quantity: 3,
        categories: [{ id: 1, name: "Pokémon TCG" }],
        attributes: [
          { name: "Idioma", options: ["pt-BR"] },
          { name: "Condição", options: ["NM"] },
          { name: "Acabamento", options: ["foil"] },
          { name: "Coleção", options: ["Obsidian Flames"] },
          { name: "Número", options: ["223/197"] },
        ],
        meta_data: [{ key: "barcode", value: "7891234567890" }],
        date_modified: "2026-10-14T10:00:00Z",
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockProducts), {
        status: 200,
        headers: {
          "x-wp-total": "1",
          "x-wp-totalpages": "1",
        },
      })
    );

    const connector = new WooCommerceConnector({
      storeUrl: "https://minhaloja-tcg.com.br",
      consumerKey: "ck_test1234",
      consumerSecret: "cs_test5678",
    });

    const result = await connector.pullProducts({ cursor: null, updatedAfter: null });
    expect(result.items).toHaveLength(1);

    const charizard = result.items[0];
    expect(charizard.externalId).toBe("101");
    expect(charizard.sku).toBe("POK-OBF-223");
    expect(charizard.price).toBe("450.00");
    expect(charizard.cost).toBeNull(); // Custo ausente não é inventado
    expect(charizard.quantity).toBe(3);
    expect(charizard.language).toBe("pt-BR");
    expect(charizard.finish).toBe("foil");
    expect(charizard.setName).toBe("Obsidian Flames");
    expect(charizard.collectorNumber).toBe("223/197");
    expect(charizard.barcode).toBe("7891234567890");
    expect(result.nextCursor).toBeNull();
  });

  it("trata erro HTTP 429 de rate limit com mensagem explícita", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "woocommerce_rest_rate_limit" }), {
        status: 429,
        statusText: "Too Many Requests",
      })
    );

    const connector = new WooCommerceConnector({
      storeUrl: "https://minhaloja-tcg.com.br",
      consumerKey: "ck_test1234",
      consumerSecret: "cs_test5678",
    });

    await expect(connector.pullProducts({ cursor: null, updatedAfter: null })).rejects.toThrow(
      "Limite de requisições excedido"
    );
  });
});
