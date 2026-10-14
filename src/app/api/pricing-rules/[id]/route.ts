import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { updatePricingRuleSchema } from "@/server/autopilot/schemas";
import {
  AutopilotValidationError,
  deletePricingRule,
  updatePricingRule,
} from "@/server/autopilot/service";

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireOrganization("admin");
    const { id } = await props.params;
    const json = await request.json();
    const input = updatePricingRuleSchema.parse(json);
    const updated = await updatePricingRule(actor.organizationId, id, input);
    if (!updated) {
      return Response.json({ error: "Regra não encontrada." }, { status: 404 });
    }
    return Response.json(updated);
  } catch (error) {
    if (error instanceof AutopilotValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return authErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireOrganization("admin");
    const { id } = await props.params;
    const deleted = await deletePricingRule(actor.organizationId, id);
    if (!deleted) {
      return Response.json({ error: "Regra não encontrada." }, { status: 404 });
    }
    return Response.json({ success: true, id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
