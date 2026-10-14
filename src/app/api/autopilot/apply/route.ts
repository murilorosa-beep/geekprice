import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { applyBatchInputSchema } from "@/server/autopilot/schemas";
import { applyPriceBatch, AutopilotConflictError } from "@/server/autopilot/service";

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const json = await request.json();
    const input = applyBatchInputSchema.parse(json);
    const result = await applyPriceBatch(actor.organizationId, actor.userId, input);
    return Response.json(result.success ? result : { error: result.message }, { status: result.success ? 200 : 400 });
  } catch (error) {
    if (error instanceof AutopilotConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
