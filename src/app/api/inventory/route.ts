import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { createInventoryItem, listInventory } from "@/server/inventory/service";
import { inventoryInputSchema, inventoryQuerySchema } from "@/server/inventory/schemas";

export async function GET(request: Request) {
  try {
    const context = await requireOrganization();
    const query = inventoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listInventory(context.organizationId, query));
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireOrganization("admin");
    const input = inventoryInputSchema.parse(await request.json());
    return Response.json(await createInventoryItem(context.organizationId, input), { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
