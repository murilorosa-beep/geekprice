import { z } from "zod";
import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { deleteInventoryItem, updateInventoryItem } from "@/server/inventory/service";
import { inventoryUpdateSchema } from "@/server/inventory/schemas";

const idSchema = z.uuid();

export async function PATCH(request: Request, context: RouteContext<"/api/inventory/[id]">) {
  try {
    const actor = await requireOrganization("admin");
    const { id } = await context.params;
    const item = await updateInventoryItem(actor.organizationId, idSchema.parse(id), inventoryUpdateSchema.parse(await request.json()));
    return item ? Response.json(item) : Response.json({ error: "Item não encontrado." }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/inventory/[id]">) {
  try {
    const actor = await requireOrganization("admin");
    const { id } = await context.params;
    const item = await deleteInventoryItem(actor.organizationId, idSchema.parse(id));
    return item ? new Response(null, { status: 204 }) : Response.json({ error: "Item não encontrado." }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}
