import { createHmac, timingSafeEqual } from "node:crypto";
import type { BrlMarketRowInput } from "./partner-csv";

function signature(organizationId: string, hash: string, rows: BrlMarketRowInput[], expiresAt: number) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign import previews");
  return createHmac("sha256", secret).update(JSON.stringify({ organizationId, hash, rows, expiresAt })).digest("hex");
}

export function signBrlImportPreview(organizationId: string, hash: string, rows: BrlMarketRowInput[]) {
  const expiresAt = Date.now() + 15 * 60_000;
  return `${expiresAt}.${signature(organizationId, hash, rows, expiresAt)}`;
}

export function verifyBrlImportPreview(token: string, organizationId: string, hash: string, rows: BrlMarketRowInput[]) {
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;
  const expected = Buffer.from(signature(organizationId, hash, rows, expiresAt), "hex");
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}
