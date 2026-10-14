import { createHash } from "node:crypto";
import { isMercadoPagoConfigured, parseMercadoPagoEvent, processMercadoPagoAuthorizedPaymentWebhook, processMercadoPagoPreapprovalWebhook, verifyMercadoPagoSignature } from "@/server/billing/mercadopago";

export async function POST(request: Request) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  if (!isMercadoPagoConfigured()) return Response.json({ error: "Webhook não configurado." }, { status: 503 });

  try {
    const body: unknown = await request.json();
    const event = parseMercadoPagoEvent(body);
    const url = new URL(request.url);
    const dataId = url.searchParams.get("data.id") ?? (event.data?.id === undefined ? null : String(event.data.id));
    const requestId = request.headers.get("x-request-id");
    const signature = request.headers.get("x-signature");
    if (!verifyMercadoPagoSignature({ signature, requestId, dataId, secret })) {
      return Response.json({ error: "Assinatura de webhook inválida." }, { status: 401 });
    }
    const eventType = event.type ?? "";
    const resourceId = dataId ?? "";
    if (!resourceId) return Response.json({ error: "Notificação sem identificador de recurso." }, { status: 400 });
    if (eventType !== "subscription_preapproval" && eventType !== "subscription_authorized_payment") {
      return Response.json({ received: true });
    }
    const eventId = event.id === undefined
      ? createHash("sha256").update(`${eventType}:${event.action ?? ""}:${resourceId}:${requestId}`).digest("hex")
      : `${eventType}:${event.id}`;
    if (eventType === "subscription_preapproval") {
      await processMercadoPagoPreapprovalWebhook({ eventId, eventType, resourceId });
    } else {
      await processMercadoPagoAuthorizedPaymentWebhook({ eventId, eventType, resourceId });
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Falha ao processar webhook do Mercado Pago.", error);
    return Response.json({ error: "Não foi possível processar a notificação." }, { status: 500 });
  }
}
