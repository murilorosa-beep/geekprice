import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { cancelMercadoPagoSubscription } from "@/server/billing/mercadopago";

export async function POST() {
  try {
    const actor = await requireOrganization("admin", true);
    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, actor.organizationId)).limit(1);
    if (!subscription) return Response.json({ error: "Assinatura não encontrada." }, { status: 404 });
    if (subscription.externalSubscriptionId && subscription.status !== "canceled") {
      await cancelMercadoPagoSubscription(subscription.externalSubscriptionId);
    }
    await db.update(subscriptions).set({ status: "canceled", canceledAt: new Date(), cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscription.id));
    return Response.json({ message: "Assinatura cancelada." });
  } catch (error) {
    return authErrorResponse(error);
  }
}
