import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { memberships, teamInvitations, users } from "@/db/schema";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getPublicBaseUrl, isEmailDeliveryConfigured, sendTransactionalEmail } from "@/server/auth/email";
import { getApprovedLegalVersions } from "@/server/auth/legal";
import { assertTeamCapacity } from "@/server/billing/limits";

const invitationSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["admin", "member"]),
});

export async function GET() {
  try {
    const actor = await requireOrganization();
    const now = new Date();
    const [members, invitations] = await Promise.all([
      db.select({ userId: users.id, name: users.name, email: users.email, verifiedAt: users.emailVerifiedAt, role: memberships.role, createdAt: memberships.createdAt })
        .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, actor.organizationId)).orderBy(asc(users.name)),
      db.select({ id: teamInvitations.id, email: teamInvitations.email, role: teamInvitations.role, expiresAt: teamInvitations.expiresAt, createdAt: teamInvitations.createdAt })
        .from(teamInvitations).where(and(eq(teamInvitations.organizationId, actor.organizationId), isNull(teamInvitations.acceptedAt), gt(teamInvitations.expiresAt, now))),
    ]);
    return Response.json({ members, invitations });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const parsed = invitationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Informe um e-mail válido e um papel permitido." }, { status: 400 });
    if (parsed.data.role === "admin" && actor.role !== "owner") return Response.json({ error: "Somente o proprietário pode convidar administradores." }, { status: 403 });
    if (!isEmailDeliveryConfigured()) return Response.json({ error: "Convites indisponíveis até configurar o serviço de e-mail." }, { status: 503 });
    if (!getApprovedLegalVersions()) return Response.json({ error: "Convites indisponíveis até a aprovação jurídica dos documentos." }, { status: 503 });

    const [[existingUser], [activeMembership]] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1),
      db.select({ userId: memberships.userId }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.organizationId, actor.organizationId), eq(users.email, parsed.data.email))).limit(1),
    ]);
    if (activeMembership) return Response.json({ error: "Este e-mail já faz parte da equipe." }, { status: 409 });
    if (existingUser) {
      const [anyMembership] = await db.select({ organizationId: memberships.organizationId }).from(memberships).where(eq(memberships.userId, existingUser.id)).limit(1);
      if (anyMembership) return Response.json({ error: "Este usuário já está vinculado a uma loja." }, { status: 409 });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const [invitation] = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${actor.organizationId}, 1))`);
      await tx.delete(teamInvitations).where(and(
        eq(teamInvitations.organizationId, actor.organizationId),
        eq(teamInvitations.email, parsed.data.email),
        isNull(teamInvitations.acceptedAt),
      ));
      await assertTeamCapacity(tx, actor.organizationId, true);
      return tx.insert(teamInvitations).values({
        organizationId: actor.organizationId,
        invitedById: actor.userId,
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning({ id: teamInvitations.id });
    });
    const link = new URL("/accept-invitation", getPublicBaseUrl());
    link.searchParams.set("token", rawToken);
    try {
      await sendTransactionalEmail({
        to: parsed.data.email,
        subject: "Convite para a equipe GeekPrice",
        text: `Você foi convidado para participar da equipe GeekPrice com o papel ${parsed.data.role}.\n\nAceite o convite em: ${link.toString()}\n\nO convite expira em 7 dias.`,
      });
    } catch (error) {
      await db.delete(teamInvitations).where(eq(teamInvitations.id, invitation.id));
      throw error;
    }
    return Response.json({ message: `Convite enviado para ${parsed.data.email}.` }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
