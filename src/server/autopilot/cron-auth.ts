import { createHash, timingSafeEqual } from "node:crypto";

export const MINIMUM_CRON_SECRET_LENGTH = 32;

export function isCronSecretConfigured(secret: string | undefined) {
  return Boolean(secret && secret.trim().length >= MINIMUM_CRON_SECRET_LENGTH);
}

export function isCronRequestAuthorized(authorization: string | null, secret: string) {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;

  const providedDigest = createHash("sha256").update(match[1], "utf8").digest();
  const expectedDigest = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}
