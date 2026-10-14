import "server-only";

import { and, asc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  billingPlans,
  coupons,
  softwareProducts,
  subscriptions,
} from "@/db/schema";

export type SubscriptionAccessState = "active" | "grace" | "read_only" | "blocked";

export function resolveSubscriptionAccess(input: {
  status: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  periodEndsAt: Date | null;
}, now = new Date()): SubscriptionAccessState {
  if (input.status === "active") return "active";
  if (input.status === "trialing") {
    return !input.trialEndsAt || input.trialEndsAt > now ? "active" : "read_only";
  }
  if (input.status === "past_due") {
    return input.graceEndsAt && input.graceEndsAt > now ? "grace" : "read_only";
  }
  return input.periodEndsAt && input.periodEndsAt > now ? "read_only" : "blocked";
}

export function calculateDiscountedPrice(
  price: string | number,
  coupon: { type: "percentage" | "fixed"; value: string | number },
) {
  const base = new Decimal(price);
  const discount = coupon.type === "percentage"
    ? base.mul(new Decimal(coupon.value).div(100))
    : new Decimal(coupon.value);
  return Decimal.max(base.minus(discount), new Decimal(1)).toDecimalPlaces(2).toNumber();
}

export async function listPublicSoftwareCatalog() {
  const [products, plans] = await Promise.all([
    db.select().from(softwareProducts)
      .where(eq(softwareProducts.active, true))
      .orderBy(asc(softwareProducts.displayOrder), asc(softwareProducts.name)),
    db.select().from(billingPlans)
      .where(eq(billingPlans.active, true))
      .orderBy(asc(billingPlans.displayOrder), asc(billingPlans.name)),
  ]);
  return products.map((product) => ({
    ...product,
    plans: plans.filter((plan) => plan.softwareProductId === product.id),
  }));
}

export async function listOrganizationSoftware(organizationId: string) {
  const products = await db.select({
    id: softwareProducts.id,
    code: softwareProducts.code,
    slug: softwareProducts.slug,
    name: softwareProducts.name,
    tagline: softwareProducts.tagline,
    description: softwareProducts.description,
    icon: softwareProducts.icon,
    accent: softwareProducts.accent,
    appPath: softwareProducts.appPath,
    marketingFeatures: softwareProducts.marketingFeatures,
    active: softwareProducts.active,
    subscriptionId: subscriptions.id,
    planId: subscriptions.planId,
    planCode: subscriptions.plan,
    status: subscriptions.status,
    interval: subscriptions.interval,
    trialEndsAt: subscriptions.trialEndsAt,
    periodEndsAt: subscriptions.periodEndsAt,
    graceEndsAt: subscriptions.graceEndsAt,
    cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    planName: billingPlans.name,
    features: billingPlans.features,
  }).from(softwareProducts)
    .leftJoin(subscriptions, and(
      eq(subscriptions.softwareProductId, softwareProducts.id),
      eq(subscriptions.organizationId, organizationId),
    ))
    .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
    .where(eq(softwareProducts.active, true))
    .orderBy(asc(softwareProducts.displayOrder));

  return products.map((product) => ({
    ...product,
    access: product.subscriptionId
      ? resolveSubscriptionAccess({
        status: product.status!,
        trialEndsAt: product.trialEndsAt,
        graceEndsAt: product.graceEndsAt,
        periodEndsAt: product.periodEndsAt,
      })
      : "blocked" as const,
  }));
}

export async function findValidCoupon(code: string, softwareProductId: string) {
  const now = new Date();
  const [coupon] = await db.select().from(coupons)
    .where(eq(coupons.code, code.trim().toUpperCase())).limit(1);
  if (!coupon || !coupon.active) return null;
  if (coupon.softwareProductId && coupon.softwareProductId !== softwareProductId) return null;
  if (coupon.startsAt && coupon.startsAt > now) return null;
  if (coupon.endsAt && coupon.endsAt <= now) return null;
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) return null;
  return coupon;
}

export async function hasProductEntitlement(
  organizationId: string,
  productCode: string,
  feature?: string,
) {
  const [record] = await db.select({
    status: subscriptions.status,
    trialEndsAt: subscriptions.trialEndsAt,
    graceEndsAt: subscriptions.graceEndsAt,
    periodEndsAt: subscriptions.periodEndsAt,
    features: billingPlans.features,
  }).from(subscriptions)
    .innerJoin(softwareProducts, eq(softwareProducts.id, subscriptions.softwareProductId))
    .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
    .where(and(
      eq(subscriptions.organizationId, organizationId),
      eq(softwareProducts.code, productCode),
    )).limit(1);
  if (!record) return false;
  const access = resolveSubscriptionAccess(record);
  if (access === "blocked") return false;
  return !feature || (record.features ?? []).includes(feature);
}
