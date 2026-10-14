import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { authActionTokens, users } from "@/db/schema";

export type AuthActionPurpose = "verify_email" | "reset_password";

export function hashActionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildAuthActionToken(purpose: AuthActionPurpose, ttlMs: number) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  return {
    token,
    record: {
      purpose,
      tokenHash: hashActionToken(token),
      expiresAt: new Date(now.getTime() + ttlMs),
    },
  };
}

export async function createAuthActionToken(userId: string, purpose: AuthActionPurpose, ttlMs: number) {
  const actionToken = buildAuthActionToken(purpose, ttlMs);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(authActionTokens).set({ usedAt: now }).where(and(
      eq(authActionTokens.userId, userId),
      eq(authActionTokens.purpose, purpose),
      isNull(authActionTokens.usedAt),
    ));
    await tx.insert(authActionTokens).values({
      userId,
      ...actionToken.record,
    });
  });
  return actionToken.token;
}

async function claimAuthActionToken(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], token: string, purpose: AuthActionPurpose) {
  const [action] = await tx.update(authActionTokens).set({ usedAt: new Date() }).where(and(
    eq(authActionTokens.tokenHash, hashActionToken(token)),
    eq(authActionTokens.purpose, purpose),
    isNull(authActionTokens.usedAt),
    gt(authActionTokens.expiresAt, new Date()),
  )).returning({ userId: authActionTokens.userId });
  return action?.userId ?? null;
}

export async function verifyEmailActionToken(token: string) {
  return db.transaction(async (tx) => {
    const userId = await claimAuthActionToken(tx, token, "verify_email");
    if (!userId) return false;
    const [user] = await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId)).returning({ id: users.id });
    return Boolean(user);
  });
}

export async function resetPasswordWithActionToken(token: string, passwordHash: string) {
  return db.transaction(async (tx) => {
    const userId = await claimAuthActionToken(tx, token, "reset_password");
    if (!userId) return false;
    const [user] = await tx.update(users).set({
      passwordHash,
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
      .where(eq(users.id, userId)).returning({ id: users.id });
    return Boolean(user);
  });
}
