import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { organizationSettingsSchema } from "@/server/settings/schemas";
import { getOrganizationSettings, updateOrganizationSettings } from "@/server/settings/service";

export async function GET() {
  try {
    const actor = await requireOrganization();
    return Response.json(await getOrganizationSettings(actor.organizationId));
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const input = organizationSettingsSchema.parse(await request.json());
    return Response.json(await updateOrganizationSettings(actor.organizationId, input));
  } catch (error) { return authErrorResponse(error); }
}
