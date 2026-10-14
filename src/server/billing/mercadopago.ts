import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import Decimal from "decimal.js";
import { db } from "@/db";
import { billingPlans, billingWebhookEvents, subscriptionPayments, subscriptions } from "@/db/schema";

const apiBase = "https://api.mercadopago.com";

const preapprovalSchema = z.object({
  id: z.string(),
  status: z.string(),
  external_reference: z.string().optional(),
  next_payment_date: z.string().optional(),
  auto_recurring: z.object({
    transaction_amount: z.number().optional(),
    currency_id: z.string().optional(),
  }).optional(),
});
const authorizedPaymentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  transaction_amount: z.number().optional(),
  currency_id: z.string().optional(),
  payment_id: z.union([z.string(), z.number()]).optional(),
  date_created: z.string().optional(),
  payment_method_id: z.string().optional(),
  preapproval_id: z.string(),
  status: z.string(),
});

async function wasWebhookEventProcessed(eventId: string) {
  const [event] = await db.select({ processedAt: billingWebhookEvents.processedAt })
    .from(billingWebhookEvents).where(eq(billingWebhookEvents.eventId, eventId)).limit(1);
  return Boolean(event?.processedAt);
}

export function isMercadoPagoConfigured() {
  return Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN && process.env.MERCADO_PAGO_WEBHOOK_SECRET);
}

export async function mercadoPagoRequest<T>(path: string, init: RequestInit = {}, idempotencyKey?: string): Promise<T> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não está configurado.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("X-Idempotency-Key", idempotencyKey);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = text; }
  if (!response.ok) {
    console.error("Mercado Pago API request failed.", response.status, payload);
    throw new Error(`Mercado Pago retornou HTTP ${response.status}.`);
  }
  return payload as T;
}

export function verifyMercadoPagoSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs?: number;
  maximumAgeMs?: number;
}) {
  if (!input.signature || !input.requestId || !input.dataId) return false;
  const parts = Object.fromEntries(input.signature.split(",").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part.trim(), ""] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  const timestamp = parts.ts;
  const received = parts.v1;
  if (!timestamp || !received || !/^[a-f0-9]{64}$/i.test(received)) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  const timestampMs = timestampNumber > 1_000_000_000_000
    ? timestampNumber
    : timestampNumber * 1000;
  const nowMs = input.nowMs ?? Date.now();
  const maximumAgeMs = input.maximumAgeMs ?? 5 * 60 * 1000;
  if (Math.abs(nowMs - timestampMs) > maximumAgeMs) return false;
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${timestamp};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  const provided = Buffer.from(received, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function createCheckoutIdempotencyKey() {
  return randomUUID();
}

export function recurringPlanMatches(
  autoRecurring: { transaction_amount?: number; currency_id?: string } | undefined,
  monthlyPrice: string | null,
) {
  return Boolean(
    autoRecurring?.currency_id === "BRL"
      && autoRecurring.transaction_amount !== undefined
      && monthlyPrice !== null
      && new Decimal(autoRecurring.transaction_amount).eq(new Decimal(monthlyPrice)),
  );
}

export async function createMercadoPagoSubscription(input: {
  id: string;
  storeName: string;
  email: string;
  planName: string;
  monthlyPrice: number;
  startDate: Date;
  backUrl: string;
  idempotencyKey: string;
}) {
  const payload = await mercadoPagoRequest<{ id?: string; init_point?: string }>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      status: "pending",
      reason: `${input.storeName} — GeekPrice ${input.planName}`,
      external_reference: input.id,
      payer_email: input.email,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.monthlyPrice,
        currency_id: "BRL",
        ...(input.startDate.getTime() > Date.now() + 60_000 ? { start_date: input.startDate.toISOString() } : {}),
      },
    }),
  }, input.idempotencyKey);
  if (!payload.id || !payload.init_point) throw new Error("Mercado Pago não retornou o identificador e o link de assinatura.");
  return { id: payload.id, url: payload.init_point };
}

export async function updateMercadoPagoSubscription(id: string, monthlyPrice: number) {
  return mercadoPagoRequest<unknown>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ auto_recurring: { transaction_amount: monthlyPrice, currency_id: "BRL" } }),
  });
}

export async function cancelMercadoPagoSubscription(id: string) {
  return mercadoPagoRequest<unknown>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "canceled" }),
  });
}

export async function processMercadoPagoPreapprovalWebhook(input: {
  eventId: string;
  eventType: string;
  resourceId: string;
}) {
  if (await wasWebhookEventProcessed(input.eventId)) return;
  const remote = preapprovalSchema.parse(await mercadoPagoRequest<unknown>(`/preapproval/${encodeURIComponent(input.resourceId)}`));
  const subscriptionId = remote.external_reference;
  if (!subscriptionId) throw new Error("A assinatura do Mercado Pago não possui referência interna.");
  const [current] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  if (!current) throw new Error("A assinatura recebida não possui registro local.");
  if (current.externalSubscriptionId && current.externalSubscriptionId !== remote.id) return;
  if (!current.externalSubscriptionId) throw new Error("A assinatura local ainda não foi vinculada ao Mercado Pago.");

  const [plan] = current.checkoutPlanId
    ? await db.select().from(billingPlans).where(eq(billingPlans.id, current.checkoutPlanId)).limit(1)
    : [];
  if (remote.status === "authorized" && current.checkoutPlanId && !plan) {
    throw new Error("O plano pendente desta assinatura não existe mais.");
  }
  if (remote.status === "authorized" && plan) {
    if (!recurringPlanMatches(remote.auto_recurring, plan.monthlyPrice)) {
      throw new Error("O valor confirmado pelo Mercado Pago não corresponde ao plano solicitado.");
    }
  }
  const status = remote.status === "authorized" ? "active"
    : (remote.status === "cancelled" || remote.status === "canceled") ? "canceled"
      : remote.status === "paused" ? "past_due"
        : current.status;
  await db.transaction(async (tx) => {
    await tx.update(subscriptions).set({
      status,
      ...(remote.status === "authorized" && plan ? {
        planId: plan.id,
        plan: plan.code,
        productLimit: plan.productLimit,
        memberLimit: plan.memberLimit,
      } : {}),
      ...((remote.status === "cancelled" || remote.status === "canceled") ? { canceledAt: new Date() } : {}),
      ...(remote.next_payment_date ? { periodEndsAt: new Date(remote.next_payment_date) } : {}),
      updatedAt: new Date(),
    }).where(and(eq(subscriptions.id, current.id), eq(subscriptions.externalSubscriptionId, remote.id)));
    await tx.insert(billingWebhookEvents).values({
      eventId: input.eventId,
      eventType: input.eventType,
      resourceId: remote.id,
      processedAt: new Date(),
    }).onConflictDoNothing({ target: billingWebhookEvents.eventId });
  });
}

export async function processMercadoPagoAuthorizedPaymentWebhook(input: {
  eventId: string;
  eventType: string;
  resourceId: string;
}) {
  if (await wasWebhookEventProcessed(input.eventId)) return;
  const payment = authorizedPaymentSchema.parse(
    await mercadoPagoRequest<unknown>(`/authorized_payments/${encodeURIComponent(input.resourceId)}`),
  );
  const [current] = await db.select().from(subscriptions)
    .where(eq(subscriptions.externalSubscriptionId, payment.preapproval_id)).limit(1);
  if (!current) throw new Error("O pagamento recorrente não corresponde a uma assinatura local.");
  const isPaymentCanceled = payment.status === "cancelled" || payment.status === "canceled";
  const status = payment.status === "approved" ? "active"
    : payment.status === "rejected" || isPaymentCanceled ? "past_due"
      : current.status;
  const paymentAmount = payment.transaction_amount !== undefined
    ? new Decimal(payment.transaction_amount).toFixed(2)
    : (current.checkoutPrice ?? "0.00");
  const paymentStatusValue = payment.status === "approved" ? "approved" as const
    : payment.status === "rejected" ? "rejected" as const
    : payment.status === "refunded" ? "refunded" as const
    : isPaymentCanceled ? "canceled" as const
    : "pending" as const;
  const externalInvoiceId = String(payment.id);
  const externalPaymentId = payment.payment_id !== undefined ? String(payment.payment_id) : String(payment.id);
  await db.transaction(async (tx) => {
    await tx.update(subscriptions).set({ status, updatedAt: new Date() })
      .where(and(eq(subscriptions.id, current.id), eq(subscriptions.externalSubscriptionId, payment.preapproval_id)));
    await tx.insert(subscriptionPayments).values({
      subscriptionId: current.id,
      externalInvoiceId,
      externalPaymentId,
      status: paymentStatusValue,
      amount: paymentAmount,
      currency: payment.currency_id ?? "BRL",
      paidAt: payment.status === "approved" ? new Date() : null,
      failedAt: payment.status === "rejected" ? new Date() : null,
      refundedAt: payment.status === "refunded" ? new Date() : null,
      providerStatus: payment.status,
      metadata: payment as Record<string, unknown>,
    }).onConflictDoUpdate({
      target: subscriptionPayments.externalInvoiceId,
      set: {
        status: paymentStatusValue,
        amount: paymentAmount,
        providerStatus: payment.status,
        paidAt: payment.status === "approved" ? new Date() : undefined,
        failedAt: payment.status === "rejected" ? new Date() : undefined,
        refundedAt: payment.status === "refunded" ? new Date() : undefined,
        metadata: payment as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
    await tx.insert(billingWebhookEvents).values({
      eventId: input.eventId,
      eventType: input.eventType,
      resourceId: String(payment.id),
      processedAt: new Date(),
    }).onConflictDoNothing({ target: billingWebhookEvents.eventId });
  });
}

export async function reconcileSubscriptionWithMercadoPago(subscriptionId: string) {
  const [current] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  if (!current || !current.externalSubscriptionId) return { reconciled: false, reason: "Sem assinatura externa vinculada." };

  const remote = preapprovalSchema.parse(
    await mercadoPagoRequest<unknown>(`/preapproval/${encodeURIComponent(current.externalSubscriptionId)}`),
  );

  const isCanceled = remote.status === "canceled" || remote.status === "cancelled";
  const newStatus = remote.status === "authorized" ? "active"
    : isCanceled ? "canceled"
    : remote.status === "paused" ? "past_due"
    : current.status;

  await db.update(subscriptions).set({
    status: newStatus,
    ...(isCanceled && !current.canceledAt ? { canceledAt: new Date() } : {}),
    ...(remote.next_payment_date ? { periodEndsAt: new Date(remote.next_payment_date) } : {}),
    updatedAt: new Date(),
  }).where(eq(subscriptions.id, current.id));

  return { reconciled: true, status: newStatus };
}

export function parseMercadoPagoEvent(value: unknown) {
  return z.object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).optional(),
  }).parse(value);
}
