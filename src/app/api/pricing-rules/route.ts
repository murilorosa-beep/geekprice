import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { createPricingRuleSchema } from "@/server/autopilot/schemas";
import { createPricingRule, listPricingRules } from "@/server/autopilot/service";

export async function GET() {
  try {
    const actor = await requireOrganization();
    const rules = await listPricingRules(actor.organizationId);
    return Response.json(rules);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const json = await request.json();
    const input = createPricingRuleSchema.parse(json);
    const rule = await createPricingRule(actor.organizationId, input);
    return Response.json(rule, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
