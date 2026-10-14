import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { listRecommendations, refreshRecommendations } from "@/server/recommendations/service";

export async function GET() {
  try {
    const actor = await requireOrganization();
    return Response.json(await listRecommendations(actor.organizationId));
  } catch (error) { return authErrorResponse(error); }
}

export async function POST() {
  try {
    const actor = await requireOrganization("admin");
    await refreshRecommendations(actor.organizationId);
    return Response.json(await listRecommendations(actor.organizationId));
  } catch (error) { return authErrorResponse(error); }
}
