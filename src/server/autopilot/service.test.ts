import { describe, expect, it } from "vitest";
import {
  isRuleEligibleForAutoApply,
  matchRuleForItem,
  type PricingRuleRecord,
} from "./service";

describe("Autopilot Rule Matcher", () => {
  const baseRule: PricingRuleRecord = {
    id: "rule-1",
    organizationId: "org-1",
    name: "Regra Geral de Balcão",
    channel: "counter",
    category: null,
    rarity: null,
    finish: null,
    feePercent: "10.0000",
    additionalCostPercent: "0.0000",
    minimumMarginPercent: "20.0000",
    desiredMarginPercent: "25.0000",
    marketDiscountPercent: "3.0000",
    maxChangePercent: "15.0000",
    roundingMode: "ends_90",
    autoApplySafe: false,
    active: true,
    priority: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const pokemonFoilRule: PricingRuleRecord = {
    ...baseRule,
    id: "rule-2",
    name: "Pokémon Foil - Margem Premium",
    channel: "counter",
    category: "Pokémon",
    finish: "foil",
    desiredMarginPercent: "35.0000",
    priority: 50,
  };

  const marketplaceRule: PricingRuleRecord = {
    ...baseRule,
    id: "rule-3",
    name: "Regra Geral Marketplace (Taxas Altas)",
    channel: "marketplace",
    feePercent: "18.0000",
    desiredMarginPercent: "30.0000",
    priority: 10,
  };

  it("seleciona a regra mais específica para Pokémon Foil", () => {
    const rules = [baseRule, pokemonFoilRule, marketplaceRule];
    const item = {
      category: "Pokémon",
      rarity: "Secret Rare",
      finish: "foil",
    };

    const matched = matchRuleForItem(rules, item, "counter");
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe("rule-2");
    expect(matched?.name).toBe("Pokémon Foil - Margem Premium");
  });

  it("isola estratégias entre balcão e marketplace", () => {
    const rules = [baseRule, pokemonFoilRule, marketplaceRule];
    const item = {
      category: "Magic: The Gathering",
      rarity: "Rare",
      finish: "standard",
    };

    const counterMatch = matchRuleForItem(rules, item, "counter");
    expect(counterMatch?.id).toBe("rule-1");

    const marketplaceMatch = matchRuleForItem(rules, item, "marketplace");
    expect(marketplaceMatch?.id).toBe("rule-3");
    expect(marketplaceMatch?.feePercent).toBe("18.0000");
  });

  it("retorna null se não houver regra para o canal selecionado", () => {
    const rules = [baseRule, pokemonFoilRule];
    const item = { category: "Pokémon", finish: "standard" };
    const matched = matchRuleForItem(rules, item, "ecommerce");
    expect(matched).toBeNull();
  });

  it("só libera aplicação automática para uma regra explicitamente habilitada", () => {
    expect(isRuleEligibleForAutoApply(baseRule.id, [baseRule])).toBe(false);
    expect(
      isRuleEligibleForAutoApply(baseRule.id, [{ ...baseRule, autoApplySafe: true }]),
    ).toBe(true);
    expect(isRuleEligibleForAutoApply(null, [{ ...baseRule, autoApplySafe: true }])).toBe(false);
  });
});
