import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getPkmnPricesCard, PkmnPricesError, searchPkmnPrices, searchPkmnPricesSets } from "@/server/market/pkmnprices-client";

const querySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sets"), name: z.string().trim().min(2).max(80) }),
  z.object({ kind: z.literal("cards"), name: z.string().trim().max(80).optional(), number: z.string().trim().max(30).optional(), setId: z.coerce.number().int().positive().optional() })
    .refine((value) => Boolean(value.name || value.number), "Informe nome ou número."),
  z.object({ kind: z.literal("card"), id: z.coerce.number().int().positive() }),
]);

export async function GET(request: Request) {
  try {
    await requireOrganization();
    const key = process.env.PKMNPRICES_API_KEY;
    if (!key) return Response.json({ error: "PkmnPrices não está configurada no servidor." }, { status: 503 });
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = query.kind === "sets"
      ? { sets: await searchPkmnPricesSets(query.name, key) }
      : query.kind === "cards"
        ? { cards: await searchPkmnPrices(query, key) }
        : { card: await getPkmnPricesCard(query.id, key) };
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PkmnPricesError) return Response.json({ error: error.message }, { status: error.status });
    return authErrorResponse(error);
  }
}
