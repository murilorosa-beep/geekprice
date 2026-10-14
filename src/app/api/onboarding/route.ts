import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { organizationSettingsSchema } from "@/server/settings/schemas";

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin", true);
    const input = organizationSettingsSchema.parse(await request.json());
    const [organization] = await db.update(organizations).set({
      name: input.name,
      tradeName: input.tradeName || null,
      currency: input.currency,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(organizations.id, actor.organizationId)).returning({ id: organizations.id });
    if (!organization) return Response.json({ error: "Loja não encontrada." }, { status: 404 });
    return Response.json({ message: "Configuração inicial concluída." });
  } catch (error) {
    return authErrorResponse(error);
  }
}
