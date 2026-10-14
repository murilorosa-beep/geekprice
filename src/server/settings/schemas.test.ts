import { describe, expect, it } from "vitest";
import { pricingPolicySchema } from "./schemas";

const policy = { name: "Padrão", feePercent: 12, additionalCostPercent: 3, minimumMarginPercent: 15, desiredMarginPercent: 25, marketDiscountPercent: 2 };

describe("política de preços", () => {
  it("aceita taxas e margens válidas", () => { expect(pricingPolicySchema.safeParse(policy).success).toBe(true); });
  it("rejeita soma que inviabiliza o preço", () => { expect(pricingPolicySchema.safeParse({ ...policy, feePercent: 60, minimumMarginPercent: 40 }).success).toBe(false); });
  it("rejeita margem desejada abaixo da mínima", () => { expect(pricingPolicySchema.safeParse({ ...policy, minimumMarginPercent: 30, desiredMarginPercent: 20 }).success).toBe(false); });
});
