import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getIndexPriceChangeHistory } from "@/server/geekprice-index/approval";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireOrganization();
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return Response.json({ data: await getIndexPriceChangeHistory(actor.organizationId, id) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
