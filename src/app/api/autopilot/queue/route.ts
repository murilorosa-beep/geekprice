import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getAutopilotQueue } from "@/server/autopilot/service";

export async function GET(request: Request) {
  try {
    const actor = await requireOrganization();
    const url = new URL(request.url);
    const channelParam = url.searchParams.get("channel");
    const channel =
      channelParam === "ecommerce" || channelParam === "marketplace" ? channelParam : "counter";
    const data = await getAutopilotQueue(actor.organizationId, channel);
    return Response.json(data);
  } catch (error) {
    return authErrorResponse(error);
  }
}
