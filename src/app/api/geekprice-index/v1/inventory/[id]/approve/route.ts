import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { approveIndexSuggestion, IndexApprovalError } from "@/server/geekprice-index/approval";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ cardId: z.string().uuid(), confirmedVariant: z.literal(true),
  expectedCurrentPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/) });

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireOrganization("admin");
    const { id } = await context.params;
    z.string().uuid().parse(id);
    const result = await approveIndexSuggestion(actor.organizationId, actor.userId, id, schema.parse(await request.json()));
    return Response.json(result ? { data: result } : { error: "Item não encontrado." }, { status: result ? 200 : 404 });
  } catch (error) {
    if (error instanceof IndexApprovalError) return Response.json({ error: error.message }, { status: 422 });
    return authErrorResponse(error);
  }
}
