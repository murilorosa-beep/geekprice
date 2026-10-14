import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { rollbackBatchInputSchema } from "@/server/autopilot/schemas";
import { AutopilotConflictError, AutopilotNotFoundError, rollbackPriceBatch } from "@/server/autopilot/service";

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const json = await request.json();
    const input = rollbackBatchInputSchema.parse(json);
    const result = await rollbackPriceBatch(actor.organizationId, actor.userId, input.batchId);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AutopilotNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AutopilotConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
