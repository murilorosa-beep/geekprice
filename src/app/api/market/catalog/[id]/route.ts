import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { tcgdexConnector } from "@/server/market/tcgdex";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireOrganization(); const { id } = await context.params; const language = new URL(request.url).searchParams.get("language") ?? "pt-br"; return Response.json(await tcgdexConnector.getCard(id, language)); }
  catch (error) { return authErrorResponse(error); }
}
