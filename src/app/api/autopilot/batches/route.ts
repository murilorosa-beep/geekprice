import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { listPriceBatches } from "@/server/autopilot/service";

export async function GET() {
  try {
    const actor = await requireOrganization();
    const batches = await listPriceBatches(actor.organizationId);
    return Response.json(batches);
  } catch (error) {
    return authErrorResponse(error);
  }
}
