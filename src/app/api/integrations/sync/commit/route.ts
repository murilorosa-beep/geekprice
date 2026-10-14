import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { commitCommerceImport } from "@/server/commerce/service";

const commitSchema = z.object({
  connectionId: z.string().uuid("ID de conexão inválido"),
  previewToken: z.string().min(10, "Token de prévia obrigatório"),
  selectedExternalIds: z.array(z.string()).optional(),
  confirmedProbableMatches: z
    .array(
      z.object({
        externalId: z.string(),
        externalVariantId: z.string().nullable().optional(),
        inventoryItemId: z.string().uuid("ID de inventário inválido"),
      })
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireOrganization("admin");
    const json = await request.json();
    const input = commitSchema.parse(json);

    const result = await commitCommerceImport(ctx.organizationId, ctx.userId, {
      connectionId: input.connectionId,
      previewToken: input.previewToken,
      selectedExternalIds: input.selectedExternalIds,
      confirmedProbableMatches: input.confirmedProbableMatches,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
