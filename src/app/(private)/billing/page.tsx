import { count, eq } from "drizzle-orm";
import { BillingManager } from "@/components/billing-manager";
import { db } from "@/db";
import { billingPlans, inventoryItems, memberships, subscriptions } from "@/db/schema";
import { isMercadoPagoConfigured } from "@/server/billing/mercadopago";
import { getPrivatePageContext } from "@/server/page-context";

export default async function BillingPage() {
  const actor = await getPrivatePageContext(true);
  const [[subscription], [products], [members], plans] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.organizationId, actor.organizationId)).limit(1),
    db.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.organizationId, actor.organizationId)),
    db.select({ value: count() }).from(memberships).where(eq(memberships.organizationId, actor.organizationId)),
    db.select({
      id: billingPlans.id, code: billingPlans.code, name: billingPlans.name,
      description: billingPlans.description, monthlyPrice: billingPlans.monthlyPrice,
      productLimit: billingPlans.productLimit, memberLimit: billingPlans.memberLimit,
    }).from(billingPlans).where(eq(billingPlans.active, true)).orderBy(billingPlans.displayOrder),
  ]);
  return <BillingManager
    plans={plans.map((plan) => ({ ...plan, checkoutAvailable: plan.monthlyPrice !== null && Number(plan.monthlyPrice) > 0 }))}
    subscription={subscription ? {
      plan: subscription.plan,
      productLimit: subscription.productLimit,
      memberLimit: subscription.memberLimit,
      status: subscription.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt <= new Date()
        ? "past_due"
        : subscription.status,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      periodEndsAt: subscription.periodEndsAt?.toISOString() ?? null,
      canceledAt: subscription.canceledAt?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    } : null}
    productCount={products?.value ?? 0}
    memberCount={members?.value ?? 0}
    canManage={actor.role !== "member"}
    paymentReady={isMercadoPagoConfigured()}
  />;
}
