import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WooCommerceConnector } from "./woocommerce";
import { safeWooGet, validateStoreUrl, assertPublicIpv4 } from "./safe-request";

vi.mock("./safe-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-request")>();
  return { ...actual, safeWooGet: vi.fn() };
});

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

    vi.mocked(safeWooGet).mockResolvedValueOnce(
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
    vi.mocked(safeWooGet).mockResolvedValueOnce(
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

  it("não importa o pai variável nem produtos privados; preserva IDs e atributos das variações", async () => {
    vi.mocked(safeWooGet)
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 10, type: "variable", status: "publish", name: "Carta", sku: "PAI", categories: [{ name: "TCG" }] },
        { id: 11, type: "simple", status: "private", name: "Secreto", sku: "PRIVATE" },
      ]), { status: 200, headers: { "x-wp-totalpages": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 101, status: "publish", sku: "CARTA-FOIL", price: "20.00", manage_stock: true, stock_quantity: 2, attributes: [{ name: "Acabamento", option: "foil" }] },
        { id: 102, status: "private", sku: "CARTA-PRIVATE", price: "30.00" },
      ]), { status: 200, headers: { "x-wp-totalpages": "1" } }));
    const connector = new WooCommerceConnector({ storeUrl: "https://loja.com.br", consumerKey: "ck_12345", consumerSecret: "cs_12345" });
    const result = await connector.pullProducts({ cursor: null, updatedAfter: null });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ externalId: "10", externalVariantId: "101", sku: "CARTA-FOIL", finish: "foil" });
  });
});

describe("limites de rede WooCommerce", () => {
  it("bloqueia URLs internas, portas e credenciais embutidas", () => {
    for (const url of ["http://loja.com", "https://localhost", "https://127.0.0.1", "https://loja.com:8443", "https://user:pass@loja.com", "https://loja.com/redirect"]) {
      expect(() => validateStoreUrl(url)).toThrow();
    }
  });
  it("rejeita faixas IPv4 privadas, metadata e documentação", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "203.0.113.1"]) {
      expect(() => assertPublicIpv4(ip)).toThrow();
    }
    expect(() => assertPublicIpv4("8.8.8.8")).not.toThrow();
  });
});
