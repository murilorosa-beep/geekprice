import { z } from "zod";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { getBrazilianMarketQuotes } from "@/server/market/brazilian-sources";
import { persistBrazilianQuoteForInventoryItem } from "@/server/market/brazilian-service";

const querySchema = z.object({
  cardName: z.string().min(1, "Nome da carta é obrigatório."),
  game: z.enum(["pokemon", "magic"]).default("pokemon"),
  edition: z.string().optional(),
  number: z.string().optional(),
  skipCache: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const postSchema = z.object({
  inventoryItemId: z.string().uuid("ID do item de estoque inválido."),
  quote: z.object({
    sourceLabel: z.string().min(1, "Nome da fonte é obrigatório."),
    price: z.number().positive("Preço deve ser maior que zero."),
    url: z.string().optional(),
    edition: z.string().optional(),
    collectorNumber: z.string().optional(),
    cardTitle: z.string().optional(),
  }),
});

export async function GET(request: Request) {
  try {
    await requireOrganization("member");
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      cardName: searchParams.get("cardName") ?? "",
      game: searchParams.get("game") ?? undefined,
      edition: searchParams.get("edition") ?? undefined,
      number: searchParams.get("number") ?? undefined,
      skipCache: searchParams.get("skipCache") ?? undefined,
    });

    const result = await getBrazilianMarketQuotes({
      cardName: parsed.cardName,
      game: parsed.game,
      edition: parsed.edition,
      collectorNumber: parsed.number,
      skipCache: parsed.skipCache,
    });

    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const json = await request.json();
    const data = postSchema.parse(json);

    const result = await persistBrazilianQuoteForInventoryItem(
      actor.organizationId,
      data.inventoryItemId,
      data.quote
    );

    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
