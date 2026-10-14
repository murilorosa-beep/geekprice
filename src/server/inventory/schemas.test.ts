import { describe, expect, it } from "vitest";
import { inventoryInputSchema, inventoryUpdateSchema } from "./schemas";

const valid = { name: "Pikachu ex", category: "Pokémon", sku: "PK-001", cost: 10, price: 20, quantity: 2, desiredMarginPercent: 25 };

describe("validação de produtos e estoque", () => {
  it("aceita um cadastro completo e normaliza dinheiro", () => {
    const result = inventoryInputSchema.parse(valid);
    expect(result.cost).toBe("10.00"); expect(result.price).toBe("20.00");
  });
  it("rejeita margens, valores e quantidades inválidos", () => {
    expect(inventoryInputSchema.safeParse({ ...valid, desiredMarginPercent: 100 }).success).toBe(false);
    expect(inventoryInputSchema.safeParse({ ...valid, cost: -1 }).success).toBe(false);
    expect(inventoryInputSchema.safeParse({ ...valid, quantity: -1 }).success).toBe(false);
  });
  it("aceita edição parcial e rejeita edição vazia", () => {
    expect(inventoryUpdateSchema.parse({ price: 25 }).price).toBe("25.00");
    expect(inventoryUpdateSchema.safeParse({}).success).toBe(false);
  });
});
