import { describe, expect, it } from "vitest";
import { collectionInputSchema, commissionInputSchema, estimateCommission, isOverdue, resourceQuerySchema } from "./geek-workspace";

const collection = { title: "Mangá volume 1", category: "manga", status: "owned", quantity: 1, purchasePrice: "25.90" };
const commission = { title: "Armadura", category: "cosplay", customer: "Cliente teste", quantity: 2, status: "quote", materials: [{ name: "EVA", quantity: 2.5, unitCost: "20" }], laborHours: "3", hourlyRate: "30", extraCosts: "10", marginPercent: "25", totalPrice: "200", paidAmount: "50" };

describe("coleções e empréstimos", () => {
  it("valida faixas de custo sem aceitar valores negativos ou intervalo invertido", () => {
    expect(resourceQuerySchema.parse({ minPrice: "0", maxPrice: "25.90" })).toMatchObject({ minPrice: 0, maxPrice: 25.9 });
    expect(resourceQuerySchema.safeParse({ minPrice: 30, maxPrice: 20 }).success).toBe(false);
    expect(resourceQuerySchema.safeParse({ minPrice: -1 }).success).toBe(false);
  });
  it("permite um item independente sem catálogo oficial", () => {
    expect(collectionInputSchema.parse({ ...collection, category: "card", title: "Carta do meu projeto" }).title).toBe("Carta do meu projeto");
  });
  it("exige destinatário para registrar empréstimo", () => {
    expect(collectionInputSchema.safeParse({ ...collection, status: "loaned" }).success).toBe(false);
  });
  it("remove dados de empréstimo ao registrar a devolução", () => {
    expect(collectionInputSchema.parse({ ...collection, borrower: "Amigo", loanDueAt: "2026-10-20" })).toMatchObject({ borrower: "", loanDueAt: "" });
  });
  it("recusa datas impossíveis, URLs inseguras e unidades fracionadas", () => {
    for (const patch of [{ purchasedAt: "2026-02-30" }, { imageUrl: "javascript:alert(1)" }, { imageUrl: "http://example.com/a.jpg" }, { quantity: 1.5 }, { purchasePrice: "" }]) {
      expect(collectionInputSchema.safeParse({ ...collection, ...patch }).success).toBe(false);
    }
  });
  it("marca atraso apenas após a data prevista e enquanto pendente", () => {
    expect(isOverdue("2026-10-14", false, "2026-10-15")).toBe(true);
    expect(isOverdue("2026-10-15", false, "2026-10-15")).toBe(false);
    expect(isOverdue("2026-10-14", true, "2026-10-15")).toBe(false);
    expect(isOverdue("", false, "2026-10-15")).toBe(false);
  });
});
describe("orçamentos de encomendas", () => {
  it("calcula material fracionado, horas, despesas, margem sobre venda e saldo", () => {
    expect(estimateCommission(commission)).toEqual({ materialsCost: "50.00", laborCost: "90.00", totalCost: "150.00", suggestedPrice: "200.00", estimatedProfit: "50.00", remaining: "150.00" });
  });
  it("arredonda sugestão para cima para preservar a margem", () => {
    const result = estimateCommission({ ...commission, materials: [], laborHours: 0, extraCosts: 100, marginPercent: 30 });
    expect(result.suggestedPrice).toBe("142.86");
  });
  it("preserva centavos sem erro binário", () => {
    expect(estimateCommission({ ...commission, materials: [{ quantity: 3, unitCost: "0.10" }], laborHours: 0, extraCosts: 0, marginPercent: 0 }).totalCost).toBe("0.30");
  });
  it("recusa recebimentos maiores que o valor combinado", () => {
    expect(commissionInputSchema.safeParse({ ...commission, paidAmount: "201" }).success).toBe(false);
  });
  it("recusa margem impossível e custo que exceda o limite", () => {
    expect(commissionInputSchema.safeParse({ ...commission, marginPercent: 100 }).success).toBe(false);
    expect(commissionInputSchema.safeParse({ ...commission, laborHours: "100000", hourlyRate: "99999999" }).success).toBe(false);
  });
  it("recusa material sem descrição ou quantidade positiva", () => {
    expect(commissionInputSchema.safeParse({ ...commission, materials: [{ name: "", quantity: 0, unitCost: "10" }] }).success).toBe(false);
  });
  it("permite orçamento sem material e pagamento parcial", () => {
    expect(commissionInputSchema.safeParse({ ...commission, materials: [] }).success).toBe(true);
  });
});
