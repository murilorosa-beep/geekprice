import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { generateCommerceImportPreview } from "@/server/commerce/service";

const previewSchema = z.object({
  connectionId: z.string().uuid("ID de conexão inválido"),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireOrganization("admin");
    const json = await request.json();
    const input = previewSchema.parse(json);

    const preview = await generateCommerceImportPreview(ctx.organizationId, input.connectionId, {
      page: input.page,
      perPage: input.perPage,
    }, ctx.userId);

    return Response.json(preview, { status: 200 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
