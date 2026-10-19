import { describe, expect, it } from "vitest";
import { calculateRecommendation } from "./pricing";

describe("calculateRecommendation", () => {
  it("preserva a margem mínima com taxas", () => {
    const result = calculateRecommendation({ cost: 100, feesPercent: 12, desiredMarginPercent: 25, marketPrice: 150 });
    expect(result.minimumPrice).toBe(158.74);
    expect(result.suggestedPrice).toBe(158.74);
    expect(result.suggestedPrice).toBeGreaterThanOrEqual(100 / (1 - .12 - .25));
    expect(result.projectedMargin).toBeCloseTo(25, 1);
  });
  it("considera o mercado quando ele permite margem maior", () => {
    expect(calculateRecommendation({ cost: 50, feesPercent: 10, desiredMarginPercent: 20, marketPrice: 120 }).suggestedPrice).toBe(117.6);
  });
  it("funciona sem preço externo", () => {
    const result = calculateRecommendation({ cost: 100, feesPercent: 10, desiredMarginPercent: 20, marketPrice: null });
    expect(result.suggestedPrice).toBe(142.86);
  });
  it("não considera cotação zero como referência de mercado", () => {
    const result = calculateRecommendation({ cost: 100, feesPercent: 10, desiredMarginPercent: 20, currentPrice: 150, marketPrice: 0 });
    expect(result.safetyGate).toBe("missing_market_reference");
  });
  it("bloqueia a automação para carta digital TCG Pocket", () => {
    const result = calculateRecommendation({
      cost: 15, feesPercent: 12, desiredMarginPercent: 30,
      currentPrice: 23.9, marketPrice: null, unsupportedPocketMarket: true,
    });
    expect(result.safetyStatus).toBe("suspicious_flagged");
    expect(result.safetyGate).toBe("unsupported_pocket_market");
    expect(result.safetyReason).toContain("TCG Pocket");
  });
  it("arredonda valores monetários em duas casas", () => {
    expect(calculateRecommendation({ cost: 10, feesPercent: 0, desiredMarginPercent: 30 }).minimumPrice).toBe(14.29);
  });
  it("inclui custos adicionais e nunca sugere abaixo do mínimo", () => {
    const result = calculateRecommendation({ cost: 100, feesPercent: 10, additionalCostsPercent: 5, desiredMarginPercent: 20, marketPrice: 80 });
    expect(result.minimumPrice).toBe(153.85);
    expect(result.suggestedPrice).toBeGreaterThanOrEqual(result.minimumPrice);
  });
  it("rejeita percentuais cuja soma chega a 100%", () => {
    expect(() => calculateRecommendation({ cost: 100, feesPercent: 60, additionalCostsPercent: 10, desiredMarginPercent: 30 })).toThrow("menor que 100%");
  });

  describe("Autopilot e Regras Comerciais", () => {
    it("aplica arredondamento para final .90 preservando o piso rentável", () => {
      // cost 50, fees 10%, desiredMargin 20%, market 120 -> raw target = 117.6
      const result = calculateRecommendation({
        cost: 50,
        feesPercent: 10,
        desiredMarginPercent: 20,
        marketPrice: 120,
        roundingMode: "ends_90",
      });
      expect(result.suggestedPrice).toBe(117.9);
      expect(result.suggestedPrice).toBeGreaterThanOrEqual(result.minimumPrice);
    });

    it("nunca arredonda para baixo se violar o piso mínimo", () => {
      // cost 100, fees 12%, desiredMargin 25% -> minimumPrice is 158.73
      const result = calculateRecommendation({
        cost: 100,
        feesPercent: 12,
        desiredMarginPercent: 25,
        marketPrice: 150,
        roundingMode: "ends_90",
      });
      // 158.90 is >= 158.73; candidate 157.90 would violate the floor
      expect(result.suggestedPrice).toBe(158.9);
      expect(result.suggestedPrice).toBeGreaterThanOrEqual(result.minimumPrice);
    });

    it("dispara trava de segurança (suspicious_flagged) se variação passar de 15%", () => {
      // currentPrice = 100, marketPrice = 150 -> suggested = 147 -> variation ~ +47%
      const result = calculateRecommendation({
        cost: 40,
        feesPercent: 10,
        desiredMarginPercent: 20,
        currentPrice: 100,
        marketPrice: 150,
        maxChangePercent: 15,
      });
      expect(result.safetyStatus).toBe("suspicious_flagged");
      expect(result.safetyGate).toBe("spike_threshold_exceeded");
      expect(result.safetyFlag).toContain("Trava de oscilação acionada");
    });

    it("classifica como safe_auto quando a variação está dentro do limite e margem é saudável", () => {
      // currentPrice = 115, marketPrice = 120 -> suggested = 117.6 -> variation ~ +2.26%
      const result = calculateRecommendation({
        cost: 50,
        feesPercent: 10,
        desiredMarginPercent: 20,
        currentPrice: 115,
        marketPrice: 120,
        maxChangePercent: 15,
      });
      expect(result.safetyStatus).toBe("safe_auto");
      expect(result.safetyGate).toBe("none");
      expect(result.safetyFlag).toBeNull();
      expect(result.safetyReason).toContain("Alteração segura");
    });

    it("marca como suspicious_flagged quando não há dados de mercado para validação externa", () => {
      const result = calculateRecommendation({
        cost: 100,
        feesPercent: 10,
        desiredMarginPercent: 20,
        currentPrice: 140,
        marketPrice: null,
      });
      expect(result.safetyStatus).toBe("suspicious_flagged");
      expect(result.safetyGate).toBe("missing_market_reference");
      expect(result.safetyFlag).toContain("Sem cotação externa de mercado");
    });

    it("não considera seguro um produto sem custo cadastrado", () => {
      const result = calculateRecommendation({ cost: 0, feesPercent: 10, desiredMarginPercent: 20, currentPrice: 10, marketPrice: 12 });
      expect(result.safetyStatus).toBe("suspicious_flagged");
      expect(result.safetyGate).toBe("missing_cost");
    });

    it("não considera seguro um produto com preço atual zerado", () => {
      const result = calculateRecommendation({ cost: 5, feesPercent: 10, desiredMarginPercent: 20, currentPrice: 0, marketPrice: 12 });
      expect(result.safetyStatus).toBe("suspicious_flagged");
      expect(result.safetyGate).toBe("missing_current_price");
    });
  });
});
