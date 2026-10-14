import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { legalAcceptances, memberships, teamInvitations, users } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { assertTeamCapacity, PlanLimitError } from "@/server/billing/limits";
import { getApprovedLegalVersions } from "@/server/auth/legal";

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(160).optional(),
  password: z.string().min(12).max(128).optional(),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const parsed = acceptSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Convite inválido ou dados incompletos." }, { status: 400 });
    const legalVersions = getApprovedLegalVersions();
    if (!legalVersions) return Response.json({ error: "Aceitação de convites aguarda a aprovação jurídica dos documentos." }, { status: 503 });
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const [invitation] = await db.select().from(teamInvitations).where(and(
      eq(teamInvitations.tokenHash, tokenHash),
      isNull(teamInvitations.acceptedAt),
      gt(teamInvitations.expiresAt, new Date()),
    )).limit(1);
    if (!invitation) return Response.json({ error: "Convite inválido ou expirado." }, { status: 400 });

    const [existingUser] = await db.select().from(users).where(eq(users.email, invitation.email)).limit(1);
    if (existingUser) {
      const [membership] = await db.select({ organizationId: memberships.organizationId }).from(memberships)
        .where(eq(memberships.userId, existingUser.id)).limit(1);
      if (membership && membership.organizationId !== invitation.organizationId) {
        return Response.json({ error: "Este usuário já está vinculado a outra loja." }, { status: 409 });
      }
    } else if (!parsed.data.name || !parsed.data.password) {
      return Response.json({ error: "Informe seu nome e crie uma senha com pelo menos 12 caracteres." }, { status: 400 });
    }
    const passwordHash = existingUser || !parsed.data.password ? null : await hashPassword(parsed.data.password);

    await db.transaction(async (tx) => {
      await assertTeamCapacity(tx, invitation.organizationId, false);
      const [claimed] = await tx.update(teamInvitations).set({ acceptedAt: new Date() }).where(and(
        eq(teamInvitations.id, invitation.id),
        isNull(teamInvitations.acceptedAt),
        gt(teamInvitations.expiresAt, new Date()),
      )).returning({ id: teamInvitations.id });
      if (!claimed) throw new Error("INVITATION_ALREADY_USED");
      const [user] = existingUser
        ? await tx.update(users).set({ emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date() }).where(eq(users.id, existingUser.id)).returning({ id: users.id })
        : await tx.insert(users).values({
          name: parsed.data.name!,
          email: invitation.email,
          passwordHash: passwordHash!,
          emailVerifiedAt: new Date(),
        }).returning({ id: users.id });
      await tx.insert(memberships).values({
        organizationId: invitation.organizationId,
        userId: user.id,
        role: invitation.role,
      });
      await tx.insert(legalAcceptances).values([
        { userId: user.id, organizationId: invitation.organizationId, document: "terms", version: legalVersions.termsVersion },
        { userId: user.id, organizationId: invitation.organizationId, document: "privacy", version: legalVersions.privacyVersion },
      ]);
    });
    return Response.json({ message: "Convite aceito. Você já pode entrar com seu e-mail." });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_USED") {
      return Response.json({ error: "Este convite já foi utilizado." }, { status: 409 });
    }
    if (error instanceof PlanLimitError) return Response.json({ error: error.message }, { status: 422 });
    console.error("Falha ao aceitar convite da equipe.", error);
    return Response.json({ error: "Não foi possível aceitar o convite." }, { status: 500 });
  }
}
