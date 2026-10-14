import "server-only";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { organizations, pricingPolicies } from "@/db/schema";
import type { organizationSettingsSchema, pricingPolicySchema } from "./schemas";

export async function getOrganizationSettings(organizationId: string) {
  const [organization] = await db.select({ id: organizations.id, name: organizations.name, tradeName: organizations.tradeName, currency: organizations.currency })
    .from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return organization ?? null;
}

export async function updateOrganizationSettings(organizationId: string, input: z.infer<typeof organizationSettingsSchema>) {
  const [organization] = await db.update(organizations).set({ name: input.name, tradeName: input.tradeName || null, currency: input.currency, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId)).returning({ id: organizations.id, name: organizations.name, tradeName: organizations.tradeName, currency: organizations.currency });
  return organization ?? null;
}

export async function getActivePricingPolicy(organizationId: string) {
  const [policy] = await db.select().from(pricingPolicies).where(and(eq(pricingPolicies.organizationId, organizationId), eq(pricingPolicies.active, true))).limit(1);
  if (!policy) return null;
  return { ...policy, feePercent: Number(policy.feePercent), additionalCostPercent: Number(policy.additionalCostPercent), minimumMarginPercent: Number(policy.minimumMarginPercent), desiredMarginPercent: Number(policy.desiredMarginPercent), marketDiscountPercent: Number(policy.marketDiscountPercent) };
}

export async function upsertActivePricingPolicy(organizationId: string, input: z.infer<typeof pricingPolicySchema>) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: pricingPolicies.id }).from(pricingPolicies).where(and(eq(pricingPolicies.organizationId, organizationId), eq(pricingPolicies.active, true))).limit(1);
    if (existing) {
      const [updated] = await tx.update(pricingPolicies).set({ ...input, updatedAt: new Date() }).where(and(eq(pricingPolicies.id, existing.id), eq(pricingPolicies.organizationId, organizationId))).returning();
      return updated;
    }
    const [created] = await tx.insert(pricingPolicies).values({ organizationId, ...input, active: true }).returning();
    return created;
  });
}
