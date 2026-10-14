import { describe, expect, it } from "vitest";
import { calculateDiscountedPrice, resolveSubscriptionAccess } from "./service";

describe("platform subscription access", () => {
  const now = new Date("2026-10-13T12:00:00Z");

  it("keeps active and valid trial subscriptions enabled", () => {
    expect(resolveSubscriptionAccess({ status: "active", trialEndsAt: null, graceEndsAt: null, periodEndsAt: null }, now)).toBe("active");
    expect(resolveSubscriptionAccess({ status: "trialing", trialEndsAt: new Date("2026-10-14T12:00:00Z"), graceEndsAt: null, periodEndsAt: null }, now)).toBe("active");
  });

  it("uses grace and then read-only access for delinquency", () => {
    expect(resolveSubscriptionAccess({ status: "past_due", trialEndsAt: null, graceEndsAt: new Date("2026-10-14T12:00:00Z"), periodEndsAt: null }, now)).toBe("grace");
    expect(resolveSubscriptionAccess({ status: "past_due", trialEndsAt: null, graceEndsAt: new Date("2026-10-12T12:00:00Z"), periodEndsAt: null }, now)).toBe("read_only");
  });
});

describe("coupon pricing", () => {
  it("supports percentage and fixed discounts without producing a free recurring plan", () => {
    expect(calculateDiscountedPrice("100.00", { type: "percentage", value: "15" })).toBe(85);
    expect(calculateDiscountedPrice("100.00", { type: "fixed", value: "12.50" })).toBe(87.5);
    expect(calculateDiscountedPrice("10.00", { type: "fixed", value: "20" })).toBe(1);
  });
});
