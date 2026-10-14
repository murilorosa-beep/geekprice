import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { memberships, organizations, subscriptions, users } from "@/db/schema";
import { authOptions } from "./options";
import { hasMinimumRole, type MemberRole } from "./permissions";
import { ZodError } from "zod";
import { PlanLimitError } from "@/server/billing/limits";
import { resolveSubscriptionAccess, type SubscriptionAccessState } from "@/server/platform/service";

export class AuthError extends Error {
  constructor(public status: 401 | 402 | 403, message: string) { super(message); }
}

export type OrganizationSessionContext = {
  userId: string;
  organizationId: string;
  role: MemberRole;
  name: string;
  organizationName: string;
  onboardingCompleted: boolean;
  access: SubscriptionAccessState;
};

export const getOrganizationSessionContext = cache(async (): Promise<OrganizationSessionContext> => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.organizationId) throw new AuthError(401, "Autenticação necessária.");

  const [membershipRows, orgRows, subRows] = await Promise.all([
    db.select({ role: memberships.role, sessionVersion: users.sessionVersion }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId)).where(and(
      eq(memberships.userId, session.user.id),
      eq(memberships.organizationId, session.user.organizationId),
    )).limit(1),
    db.select({
      name: organizations.name,
      onboardingCompletedAt: organizations.onboardingCompletedAt,
    }).from(organizations).where(eq(organizations.id, session.user.organizationId)).limit(1),
    db.select({
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      graceEndsAt: subscriptions.graceEndsAt,
      periodEndsAt: subscriptions.periodEndsAt,
    }).from(subscriptions).where(eq(subscriptions.organizationId, session.user.organizationId)).limit(1),
  ]);

  const membership = membershipRows[0];
  if (!membership) throw new AuthError(403, "Permissão insuficiente.");
  if (membership.sessionVersion !== session.user.authVersion) throw new AuthError(401, "Sua sessão expirou. Entre novamente.");

  const organization = orgRows[0];
  const subscription = subRows[0];
  const access = subscription ? resolveSubscriptionAccess(subscription) : "active";

  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role: membership.role,
    name: session.user.name ?? "Usuário",
    organizationName: organization?.name ?? "Minha loja",
    onboardingCompleted: Boolean(organization?.onboardingCompletedAt),
    access,
  };
});

export const requireOrganization = async (minimumRole: MemberRole = "member", allowBillingAccess = false) => {
  const ctx = await getOrganizationSessionContext();
  if (!hasMinimumRole(ctx.role, minimumRole)) throw new AuthError(403, "Permissão insuficiente.");
  if (!allowBillingAccess) {
    if (ctx.access === "blocked") {
      throw new AuthError(402, "A assinatura está cancelada ou expirada. Acesse Plano e consumo para regularizar.");
    }
    if (ctx.access === "read_only" && minimumRole !== "member") {
      throw new AuthError(402, "A assinatura está em modo somente leitura. Regularize a assinatura para realizar alterações.");
    }
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role, name: ctx.name };
};

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: "Dados inválidos.", details: error.flatten().fieldErrors }, { status: 400 });
  if (error instanceof PlanLimitError) return Response.json({ error: error.message }, { status: 422 });
  console.error(error);
  return Response.json({ error: "Erro interno." }, { status: 500 });
}
