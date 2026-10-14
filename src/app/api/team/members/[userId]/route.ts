import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";

const roleSchema = z.object({ role: z.enum(["admin", "member"]) });
const userIdSchema = z.uuid();

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireOrganization("owner");
    const { userId: rawUserId } = await context.params;
    const userId = userIdSchema.parse(rawUserId);
    if (userId === actor.userId) return Response.json({ error: "Não é possível alterar seu próprio papel." }, { status: 422 });
    const parsed = roleSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Papel inválido." }, { status: 400 });
    const [updated] = await db.update(memberships).set({ role: parsed.data.role }).where(and(
      eq(memberships.organizationId, actor.organizationId),
      eq(memberships.userId, userId),
      ne(memberships.role, "owner"),
    )).returning({ userId: memberships.userId });
    return updated ? Response.json({ message: "Papel atualizado." }) : Response.json({ error: "Membro não encontrado ou protegido." }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireOrganization("owner");
    const { userId: rawUserId } = await context.params;
    const userId = userIdSchema.parse(rawUserId);
    if (userId === actor.userId) return Response.json({ error: "Não é possível remover seu próprio acesso." }, { status: 422 });
    const [removed] = await db.delete(memberships).where(and(
      eq(memberships.organizationId, actor.organizationId),
      eq(memberships.userId, userId),
      ne(memberships.role, "owner"),
    )).returning({ userId: memberships.userId });
    return removed ? new Response(null, { status: 204 }) : Response.json({ error: "Membro não encontrado ou protegido." }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
