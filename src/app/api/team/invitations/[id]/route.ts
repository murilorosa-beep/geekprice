import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { teamInvitations } from "@/db/schema";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireOrganization("admin");
    const { id: rawId } = await context.params;
    const id = z.uuid().parse(rawId);
    const [removed] = await db.delete(teamInvitations).where(and(
      eq(teamInvitations.id, id),
      eq(teamInvitations.organizationId, actor.organizationId),
      isNull(teamInvitations.acceptedAt),
    )).returning({ id: teamInvitations.id });
    return removed ? new Response(null, { status: 204 }) : Response.json({ error: "Convite não encontrado." }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
