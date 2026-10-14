import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { pricingPolicySchema } from "@/server/settings/schemas";
import { getActivePricingPolicy, upsertActivePricingPolicy } from "@/server/settings/service";

export async function GET() {
  try {
    const actor = await requireOrganization();
    return Response.json(await getActivePricingPolicy(actor.organizationId));
  } catch (error) { return authErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const input = pricingPolicySchema.parse(await request.json());
    return Response.json(await upsertActivePricingPolicy(actor.organizationId, input));
  } catch (error) { return authErrorResponse(error); }
}
