import { Dashboard } from "@/components/dashboard";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { alerts, billingPlans, subscriptions } from "@/db/schema";
import { getPrivatePageContext } from "@/server/page-context";
import { listAllInventory } from "@/server/inventory/service";
import type { Alert, Product, ProductStatus } from "@/lib/types";
import { getActivePricingPolicy } from "@/server/settings/service";
import { calculateRecommendation } from "@/lib/pricing";

import { getOrganizationMarketHistory } from "@/server/market/history";

export const metadata = {
  title: "Dashboard — GeekPrice",
  description: "Painel de controle, estoque e inteligência de preços do GeekPrice.",
};

export default async function DashboardPage() {
  const actor = await getPrivatePageContext();
  if (!actor.onboardingCompleted) redirect("/onboarding");
  const [inventory, alertRows, storedPolicy, [subscription], initialHistory] = await Promise.all([
    listAllInventory(actor.organizationId),
    db.select().from(alerts).where(eq(alerts.organizationId, actor.organizationId)).orderBy(desc(alerts.createdAt)).limit(5),
    getActivePricingPolicy(actor.organizationId),
    db.select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      planName: billingPlans.name,
    }).from(subscriptions).leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .where(eq(subscriptions.organizationId, actor.organizationId)).limit(1),
    getOrganizationMarketHistory(actor.organizationId, 30),
  ]);
  const pricing = storedPolicy ?? { feePercent: 12, additionalCostPercent: 0, minimumMarginPercent: 15, desiredMarginPercent: 25, marketDiscountPercent: 2 };
  const products: Product[] = inventory.items.map((item) => {
    const change = item.marketPrice ? ((item.currentPrice - item.marketPrice) / item.marketPrice) * 100 : 0;
    const recommendation = calculateRecommendation({ cost: item.cost, feesPercent: pricing.feePercent, additionalCostsPercent: pricing.additionalCostPercent, desiredMarginPercent: Math.max(item.desiredMarginPercent, pricing.minimumMarginPercent, pricing.desiredMarginPercent), marketDiscountPercent: pricing.marketDiscountPercent, marketPrice: item.marketPrice });
    const status: ProductStatus = item.currentPrice < recommendation.minimumPrice ? "attention" : !item.marketPrice ? "healthy" : change < -5 ? "opportunity" : change > 5 ? "attention" : "healthy";
    return { id: item.id, name: item.name, set: item.set ?? "Sem coleção", code: item.code ?? item.sku, category: item.category,
      cost: item.cost, currentPrice: item.currentPrice, marketPrice: item.marketPrice, stock: item.stock, desiredMarginPercent: item.desiredMarginPercent, change, status,
      image: item.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase() };
  });
  const mappedAlerts: Alert[] = alertRows.map((alert) => ({ id: alert.id, title: alert.title, description: alert.message,
    time: alert.createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    tone: alert.severity === "critical" ? "amber" : alert.severity === "warning" ? "amber" : "blue" }));
  const planLabel = subscription?.status === "trialing" ? "Teste grátis"
    : subscription?.status === "active" ? subscription.planName ?? subscription.plan
      : subscription?.status === "canceled" ? "Assinatura cancelada"
        : "Pagamento pendente";
  return <Dashboard initialData={{ products, alerts: mappedAlerts, userName: actor.name, organizationName: actor.organizationName, role: actor.role, planLabel, pricing, initialHistory }} />;
}
