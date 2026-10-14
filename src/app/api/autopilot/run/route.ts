import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { runAutopilotAutomation } from "@/server/autopilot/service";

export async function POST() {
  try {
    const actor = await requireOrganization("admin");
    const results = await runAutopilotAutomation(actor.organizationId);
    return Response.json({ success: true, results });
  } catch (error) {
    return authErrorResponse(error);
  }
}
