import { requireOrganization, authErrorResponse } from "@/server/auth/context";
import { getOrganizationMarketHistory } from "@/server/market/history";

export async function GET(request: Request) {
  try {
    const actor = await requireOrganization("member");
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const history = await getOrganizationMarketHistory(actor.organizationId, days);
    return Response.json(history);
  } catch (error) {
    return authErrorResponse(error);
  }
}
