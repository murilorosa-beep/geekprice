import { createHmac, timingSafeEqual } from "node:crypto";
import type { IndexImportMetadata } from "./import-csv";

function signature(userId: string, hash: string, metadata: IndexImportMetadata, expiresAt: number) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET obrigatório para prévia do Index.");
  return createHmac("sha256", secret).update(JSON.stringify({ userId, hash, metadata, expiresAt })).digest("hex");
}
export function signIndexImportPreview(userId: string, hash: string, metadata: IndexImportMetadata) {
  const expiresAt = Date.now() + 15 * 60_000;
  return `${expiresAt}.${signature(userId, hash, metadata, expiresAt)}`;
}
export function verifyIndexImportPreview(token: string, userId: string, hash: string, metadata: IndexImportMetadata) {
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;
  const actual = Buffer.from(match[2], "hex");
  const expected = Buffer.from(signature(userId, hash, metadata, expiresAt), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
