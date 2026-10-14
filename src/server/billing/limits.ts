import "server-only";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, memberships, subscriptions, teamInvitations } from "@/db/schema";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function assertProductCapacity(tx: DatabaseTransaction, organizationId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);
  const [[usage], [subscription]] = await Promise.all([
    tx.select({ value: count() }).from(inventoryItems).where(eq(inventoryItems.organizationId, organizationId)),
    tx.select({ productLimit: subscriptions.productLimit }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1),
  ]);
  const limit = subscription?.productLimit ?? 500;
  if ((usage?.value ?? 0) >= limit) {
    throw new PlanLimitError(`A loja atingiu o limite de ${limit} produtos do plano.`);
  }
}

export async function assertTeamCapacity(tx: DatabaseTransaction, organizationId: string, includePendingInvites: boolean) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 1))`);
  const now = new Date();
  const [[members], [subscription], [pending]] = await Promise.all([
    tx.select({ value: count() }).from(memberships).where(eq(memberships.organizationId, organizationId)),
    tx.select({ memberLimit: subscriptions.memberLimit }).from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1),
    includePendingInvites
      ? tx.select({ value: count() }).from(teamInvitations).where(and(
        eq(teamInvitations.organizationId, organizationId),
        isNull(teamInvitations.acceptedAt),
        gt(teamInvitations.expiresAt, now),
      ))
      : Promise.resolve([{ value: 0 }]),
  ]);
  const limit = subscription?.memberLimit ?? 1;
  if ((members?.value ?? 0) + (pending?.value ?? 0) >= limit) {
    throw new PlanLimitError(`A equipe atingiu o limite de ${limit} pessoas do plano.`);
  }
}
