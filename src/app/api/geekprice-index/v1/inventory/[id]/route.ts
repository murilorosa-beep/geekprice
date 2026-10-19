import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getInventoryIndexMatches, selectInventoryIndexCard } from "@/server/geekprice-index/inventory";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireOrganization();
    const { id } = await context.params;
    z.string().uuid().parse(id);
    const result = await getInventoryIndexMatches(actor.organizationId, id);
    return Response.json(result ? { data: result } : { error: "Item não encontrado." },
      { status: result ? 200 : 404, headers: { "Cache-Control": "private, max-age=15" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireOrganization("admin");
    const { id } = await context.params;
    z.string().uuid().parse(id);
    const { cardId } = z.object({ cardId: z.string().uuid() }).parse(await request.json());
    const link = await selectInventoryIndexCard(actor.organizationId, id, cardId, actor.userId);
    return Response.json(link ? { data: link } : { error: "Item não encontrado." }, { status: link ? 200 : 404 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("A impressão escolhida"))
      return Response.json({ error: error.message }, { status: 422 });
    return authErrorResponse(error);
  }
}
