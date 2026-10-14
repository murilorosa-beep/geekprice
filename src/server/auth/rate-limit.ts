import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

type AuthDatabase = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export const LOGIN_ATTEMPT_LIMIT = 5;
export const ACCOUNT_LOCKOUT_LIMIT = 10;
export const LOGIN_LOCK_MINUTES = 15;
export const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;

export function getLoginOriginHash(value: string) {
  return createHash("sha256").update(value || "unknown").digest("hex");
}

export function getLoginOrigin(headers?: Record<string, string | string[] | undefined> | Headers) {
  // Only trust a chain when the deployment explicitly configures a proxy
  // that strips client supplied forwarding headers and prevents direct access.
  const trustedHops = Number(process.env.TRUSTED_PROXY_HOPS || 0);
  if (!Number.isSafeInteger(trustedHops) || trustedHops <= 0) return "local-or-unknown";
  let forwarded: string | string[] | undefined;
  if (headers && "get" in headers && typeof headers.get === "function") {
    forwarded = headers.get("x-forwarded-for") ?? undefined;
  } else if (headers) {
    forwarded = (headers as Record<string, string | string[] | undefined>)["x-forwarded-for"];
  }

  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (!raw) return "local-or-unknown";

  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "local-or-unknown";

  if (parts.length < trustedHops) return "local-or-unknown";
  let selectedIp: string;
  if (trustedHops > 0 && parts.length >= trustedHops) {
    selectedIp = parts[parts.length - trustedHops] || parts[0];
  } else {
    selectedIp = parts[0];
  }

  return isIP(selectedIp) ? selectedIp : "local-or-unknown";
}

export async function assertLoginAllowed(email: string, originHash: string, database: AuthDatabase = db) {
  const normalizedEmail = email.toLowerCase().trim();

  // Layer 1: Check origin-specific lock
  const [attempt] = await database
    .select()
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, normalizedEmail),
      eq(loginAttempts.originHash, originHash),
    ))
    .limit(1);

  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    throw new Error("LOGIN_RATE_LIMITED");
  }

  // Layer 2: Check account-wide distributed brute-force limit
  const [accountSummary] = await database
    .select({
      totalFailed: sql<number>`coalesce(sum(${loginAttempts.failedAttempts}), 0)`,
      anyLocked: sql<boolean>`coalesce(bool_or(${loginAttempts.lockedUntil} > now()), false)`,
    })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, normalizedEmail),
      gt(loginAttempts.lastAttemptAt, sql`now() - interval '15 minutes'`),
    ));

  if (accountSummary?.anyLocked || Number(accountSummary?.totalFailed ?? 0) >= ACCOUNT_LOCKOUT_LIMIT) {
    throw new Error("LOGIN_RATE_LIMITED");
  }
}

export async function recordLoginFailure(email: string, originHash: string, database: AuthDatabase = db) {
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
  const lockedUntil = new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000).toISOString();

  // Update or insert origin-specific failure
  await database
    .insert(loginAttempts)
    .values({ email: normalizedEmail, originHash, failedAttempts: 1, lastAttemptAt: now })
    .onConflictDoUpdate({
      target: [loginAttempts.email, loginAttempts.originHash],
      set: {
        failedAttempts: sql`case when ${loginAttempts.lastAttemptAt} < ${windowStart}::timestamptz then 1 else ${loginAttempts.failedAttempts} + 1 end`,
        lockedUntil: sql`case when (case when ${loginAttempts.lastAttemptAt} < ${windowStart}::timestamptz then 1 else ${loginAttempts.failedAttempts} + 1 end) >= ${LOGIN_ATTEMPT_LIMIT} then ${lockedUntil}::timestamptz else null end`,
        lastAttemptAt: now,
      },
    });

  // Check if aggregate account failures now exceed ACCOUNT_LOCKOUT_LIMIT
  const [aggregate] = await database
    .select({
      totalFailed: sql<number>`coalesce(sum(${loginAttempts.failedAttempts}), 0)`,
    })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, normalizedEmail),
      gt(loginAttempts.lastAttemptAt, sql`now() - interval '15 minutes'`),
    ));

  if (Number(aggregate?.totalFailed ?? 0) >= ACCOUNT_LOCKOUT_LIMIT) {
    await database
      .update(loginAttempts)
      .set({ lockedUntil: new Date(lockedUntil) })
      .where(eq(loginAttempts.email, normalizedEmail));
  }
}

export async function clearLoginFailures(email: string, _originHash?: string, database: AuthDatabase = db) {
  void _originHash;
  const normalizedEmail = email.toLowerCase().trim();
  await database.delete(loginAttempts).where(eq(loginAttempts.email, normalizedEmail));
}
