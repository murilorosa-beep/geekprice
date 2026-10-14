import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { refreshLinkedMarket } from "@/server/market/service";
export async function POST(){try{const actor=await requireOrganization("admin");return Response.json(await refreshLinkedMarket(actor.organizationId))}catch(error){return authErrorResponse(error)}}
