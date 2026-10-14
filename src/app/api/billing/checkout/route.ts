import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { billingPlans, organizations, subscriptions, users } from "@/db/schema";
import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { cancelMercadoPagoSubscription, createCheckoutIdempotencyKey, createMercadoPagoSubscription, isMercadoPagoConfigured, updateMercadoPagoSubscription } from "@/server/billing/mercadopago";
import { getPublicBaseUrl } from "@/server/auth/email";

const schema = z.object({ planId: z.uuid() });

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin", true);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Plano inválido." }, { status: 400 });
    if (!isMercadoPagoConfigured()) return Response.json({ error: "Checkout indisponível: configure as credenciais do Mercado Pago e o segredo de webhook." }, { status: 503 });
    const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, parsed.data.planId)).limit(1);
    if (!plan || !plan.active) return Response.json({ error: "Este plano não está disponível." }, { status: 404 });
    if (!plan.monthlyPrice || Number(plan.monthlyPrice) <= 0) return Response.json({ error: "O preço deste plano ainda não foi configurado; o checkout permanece desativado." }, { status: 422 });

    const [[subscriptionOriginal], [organization], [user]] = await Promise.all([
      db.select().from(subscriptions).where(
        and(
          eq(subscriptions.organizationId, actor.organizationId),
          eq(subscriptions.softwareProductId, plan.softwareProductId),
        ),
      ).limit(1),


      db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, actor.organizationId)).limit(1),
      db.select({ email: users.email }).from(users).where(eq(users.id, actor.userId)).limit(1),
    ]);


    if (!organization || !user) return Response.json({ error: "Loja ou usuário não encontrados." }, { status: 404 });

    let subscription = subscriptionOriginal;
    if (!subscription) {
      const [createdSub] = await db.insert(subscriptions).values({
        organizationId: actor.organizationId,
        softwareProductId: plan.softwareProductId,
        plan: plan.code,
        planId: plan.id,
        status: "trialing",
        productLimit: plan.productLimit,
        memberLimit: plan.memberLimit,
        trialEndsAt: new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000),
      }).returning();
      subscription = createdSub;
    }

    if (subscription.status === "active" && subscription.externalSubscriptionId) {
      await updateMercadoPagoSubscription(subscription.externalSubscriptionId, Number(plan.monthlyPrice));
      await db.update(subscriptions).set({
        checkoutPlanId: plan.id,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, subscription.id));
      return Response.json({
        message: "Alteração solicitada. O plano será atualizado após a confirmação do Mercado Pago.",
      });
    }

    if (subscription.checkoutPlanId === plan.id && subscription.checkoutUrl && subscription.externalSubscriptionId) {
      return Response.json({ checkoutUrl: subscription.checkoutUrl });
    }

    if (subscription.externalSubscriptionId && subscription.status !== "active" && subscription.status !== "canceled") {
      await cancelMercadoPagoSubscription(subscription.externalSubscriptionId);
    }
    const idempotencyKey =
      subscription.checkoutPlanId === plan.id &&
      !subscription.externalSubscriptionId &&
      subscription.checkoutIdempotencyKey
        ? subscription.checkoutIdempotencyKey
        : createCheckoutIdempotencyKey();
    await db.update(subscriptions).set({
      checkoutPlanId: plan.id,
      checkoutIdempotencyKey: idempotencyKey,
      checkoutUrl: null,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, subscription.id));

    const startDate = subscription.trialEndsAt && subscription.trialEndsAt > new Date()
      ? subscription.trialEndsAt
      : new Date();
    const backUrl = new URL("/billing?checkout=return", getPublicBaseUrl()).toString();
    const checkout = await createMercadoPagoSubscription({
      id: subscription.id,
      storeName: organization.name,
      email: user.email,
      planName: plan.name,
      monthlyPrice: Number(plan.monthlyPrice),
      startDate,
      backUrl,
      idempotencyKey,
    });
    await db.update(subscriptions).set({
      externalSubscriptionId: checkout.id,
      checkoutUrl: checkout.url,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, subscription.id));
    return Response.json({ checkoutUrl: checkout.url });
  } catch (error) {
    if (error instanceof Error && error.message.includes("MERCADO_PAGO_ACCESS_TOKEN")) {
      return Response.json({ error: "Checkout indisponível: o token de acesso do Mercado Pago não está configurado." }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
