import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { linkCardSchema } from "@/server/market/schemas";
import { linkAndCollect } from "@/server/market/service";

export async function POST(request: Request) {
  try { const actor = await requireOrganization("admin"); const result = await linkAndCollect(actor.organizationId, linkCardSchema.parse(await request.json())); return result ? Response.json(result, { status: 201 }) : Response.json({ error: "Produto não encontrado nesta organização." }, { status: 404 }); }
  catch (error) { return authErrorResponse(error); }
}
