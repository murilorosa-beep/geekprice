import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recurringPlanMatches, verifyMercadoPagoSignature } from "./mercadopago";

function createSignature(secret: string, dataId: string, requestId: string, timestamp: string) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${timestamp},v1=${digest}`;
}

describe("Mercado Pago webhook signature", () => {
  const secret = "webhook-secret-for-tests";
  const dataId = "123456789";
  const requestId = "request-abc";
  const timestamp = "1791900000";

  it("accepts a valid signature using Mercado Pago's canonical manifest", () => {
    expect(verifyMercadoPagoSignature({
      signature: createSignature(secret, dataId, requestId, timestamp),
      requestId,
      dataId,
      secret,
      nowMs: Number(timestamp) * 1000,
    })).toBe(true);
  });

  it("rejects missing, malformed, or mismatched signatures", () => {
    const valid = createSignature(secret, dataId, requestId, timestamp);
    expect(verifyMercadoPagoSignature({ signature: null, requestId, dataId, secret })).toBe(false);
    const nowMs = Number(timestamp) * 1000;
    expect(verifyMercadoPagoSignature({ signature: valid, requestId: null, dataId, secret, nowMs })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: "v1=invalid", requestId, dataId, secret, nowMs })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: valid, requestId: "other-request", dataId, secret, nowMs })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: valid, requestId, dataId: "other-id", secret, nowMs })).toBe(false);
  });

  it("rejects a valid but stale signature", () => {
    const signature = createSignature(secret, dataId, requestId, timestamp);
    expect(verifyMercadoPagoSignature({
      signature,
      requestId,
      dataId,
      secret,
      nowMs: Number(timestamp) * 1000 + 6 * 60 * 1000,
    })).toBe(false);
  });

  it("validates the confirmed recurring amount and currency", () => {
    expect(recurringPlanMatches({ transaction_amount: 99.9, currency_id: "BRL" }, "99.90")).toBe(true);
    expect(recurringPlanMatches({ transaction_amount: 89.9, currency_id: "BRL" }, "99.90")).toBe(false);
    expect(recurringPlanMatches({ transaction_amount: 99.9, currency_id: "USD" }, "99.90")).toBe(false);
  });
});
