import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { catalogQuerySchema } from "@/server/market/schemas";
import { tcgdexConnector } from "@/server/market/tcgdex";

export async function GET(request: Request) {
  try { await requireOrganization(); const query = catalogQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json({ source: "TCGdex", items: await tcgdexConnector.search(query) }); }
  catch (error) { return authErrorResponse(error); }
}
