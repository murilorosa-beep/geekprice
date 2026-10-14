import "server-only";
import { getLoginOrigin, getLoginOriginHash } from "./rate-limit";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { publicActionLimits } from "@/db/schema";

export class PublicActionRateLimitError extends Error {
  constructor() {
    super("Muitas solicitações. Aguarde antes de tentar novamente.");
    this.name = "PublicActionRateLimitError";
  }
}

export async function assertPublicActionAllowed(request: Request, action: string, maximum: number, windowMs: number) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Invalid public rate-limit configuration");
  }
  const originHash = getLoginOriginHash(getLoginOrigin(request.headers));
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs).toISOString();
  const lockedUntil = new Date(now.getTime() + windowMs);
  // One atomic upsert: a concurrent request cannot pass a stale pre-check.
  const admitted = await db.insert(publicActionLimits).values({
    action,
    originHash,
    attempts: 1,
    windowStartedAt: now,
    lockedUntil: maximum === 1 ? lockedUntil : null,
  }).onConflictDoUpdate({
    target: [publicActionLimits.action, publicActionLimits.originHash],
    set: {
      attempts: sql`case when ${publicActionLimits.windowStartedAt} < ${windowStart}::timestamptz then 1 else ${publicActionLimits.attempts} + 1 end`,
      windowStartedAt: sql`case when ${publicActionLimits.windowStartedAt} < ${windowStart}::timestamptz then ${now.toISOString()}::timestamptz else ${publicActionLimits.windowStartedAt} end`,
      lockedUntil: sql`case when (case when ${publicActionLimits.windowStartedAt} < ${windowStart}::timestamptz then 1 else ${publicActionLimits.attempts} + 1 end) >= ${maximum} then ${lockedUntil.toISOString()}::timestamptz else null end`,
    },
    setWhere: sql`${publicActionLimits.lockedUntil} is null or ${publicActionLimits.lockedUntil} <= ${now.toISOString()}::timestamptz`,
  }).returning({ id: publicActionLimits.id });
  if (admitted.length === 0) throw new PublicActionRateLimitError();
}
