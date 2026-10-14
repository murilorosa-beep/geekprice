import { describe, expect, it } from "vitest";
import { billingPlanSchema } from "./schemas";

describe("billing plan configuration", () => {
  const plan = {
    softwareProductId: "a0000000-0000-4000-8000-000000000001",
    code: "starter",
    name: "Inicial",
    description: "",
    monthlyPrice: null,
    yearlyPrice: null,
    productLimit: 500,
    memberLimit: 3,
    active: true,
    displayOrder: 0,
  };

  it("allows an active plan without price while keeping checkout unavailable", () => {
    expect(billingPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("accepts positive Brazilian real monthly pricing", () => {
    expect(billingPlanSchema.safeParse({ ...plan, monthlyPrice: "49.90" }).success).toBe(true);
  });

  it("rejects invalid prices and limits", () => {
    expect(billingPlanSchema.safeParse({ ...plan, monthlyPrice: 0 }).success).toBe(false);
    expect(billingPlanSchema.safeParse({ ...plan, productLimit: 0 }).success).toBe(false);
    expect(billingPlanSchema.safeParse({ ...plan, memberLimit: -1 }).success).toBe(false);
  });
});
