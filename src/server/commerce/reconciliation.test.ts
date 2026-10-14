import { describe, expect, it, vi } from "vitest";
import type { CommerceProduct } from "./types";
import { reconcileCommerceProducts } from "./reconciliation";
import { db } from "@/db";

vi.mock("@/db", () => {
  return {
    db: {
      select: vi.fn(),
    },
  };
});

describe("Motor de Conciliação Inteligente de Catálogo (Reconciliation)", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";
  const connId = "22222222-2222-2222-2222-222222222222";

  it("classifica itens com dados insuficientes (sem SKU, código ou atributos)", async () => {
    // Mock db.select para retornar mapeamentos vazios e inventário vazio
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    db.select = selectMock as unknown as typeof db.select;

    const products: CommerceProduct[] = [
      {
        externalId: "ext-1",
        name: "",
        sku: null,
        barcode: null,
        category: null,
        price: "10.00",
        cost: null,
        quantity: 1,
        updatedAt: null,
      },
      {
        externalId: "ext-2",
        name: "Item Misterioso",
        sku: null,
        barcode: null,
        category: null,
        price: null,
        cost: null,
        quantity: null,
        updatedAt: null,
      },
    ];

    const results = await reconcileCommerceProducts(orgId, connId, products);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("insufficient_data");
    expect(results[1].status).toBe("insufficient_data");
  });

  it("classifica como new_product quando não há colisão no inventário", async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    db.select = selectMock as unknown as typeof db.select;

    const products: CommerceProduct[] = [
      {
        externalId: "ext-new-10",
        name: "Mewtwo VSTAR",
        sku: "POK-MEW-001",
        barcode: "7891112223334",
        category: "Pokémon",
        price: "120.00",
        cost: "70.00",
        quantity: 4,
        setName: "Crown Zenith",
        collectorNumber: "031/159",
        updatedAt: new Date(),
      },
    ];

    const results = await reconcileCommerceProducts(orgId, connId, products);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("new_product");
    expect(results[0].sku).toBe("POK-MEW-001");
    expect(results[0].cost).toBe(70);
    expect(results[0].price).toBe(120);
  });
});
