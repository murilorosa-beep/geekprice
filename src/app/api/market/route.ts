import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { marketQuerySchema } from "@/server/market/schemas";
import { getMarketData } from "@/server/market/service";

export async function GET(request: Request) {
  try { const actor = await requireOrganization(); const query = marketQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json({ groups: await getMarketData(actor.organizationId, query), periodDays: query.days }); }
  catch (error) { return authErrorResponse(error); }
}
