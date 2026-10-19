import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getIndexPricingPreview } from "@/server/geekprice-index/inventory";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireOrganization();
    const { id } = await context.params;
    z.string().uuid().parse(id);
    const result = await getIndexPricingPreview(actor.organizationId, id);
    return Response.json(result ? { data: result } : { error: "Item não encontrado." },
      { status: result ? 200 : 404, headers: { "Cache-Control": "private, max-age=15" } });
  } catch (error) { return authErrorResponse(error); }
}
