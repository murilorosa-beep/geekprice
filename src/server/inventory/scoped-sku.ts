import { createHash } from "node:crypto";

export function organizationScopedSku(organizationId: string, sku: string) {
  const full = `org:${organizationId}:${sku}`;
  return full.length <= 120 ? full : `org:${organizationId}:sha256:${createHash("sha256").update(sku).digest("hex")}`;
}
