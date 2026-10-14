import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { externalListings, inventoryItems, productVariants, sources } from "@/db/schema";
import { authErrorResponse, requireOrganization } from "@/server/auth/context";
import { linkAndCollect, linkScryfallAndCollect } from "@/server/market/service";

const inputSchema = z.object({ inventoryItemId: z.uuid() });

export async function POST(request: Request) {
  try {
    const actor = await requireOrganization("admin");
    const { inventoryItemId } = inputSchema.parse(await request.json());
    const [item] = await db.select({
      variantId: productVariants.id,
      catalogSource: productVariants.catalogSource,
      canonicalId: productVariants.canonicalId,
      language: productVariants.language,
    }).from(inventoryItems)
      .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
      .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.organizationId, actor.organizationId)))
      .limit(1);
    if (!item) return Response.json({ error: "Produto não encontrado nesta loja." }, { status: 404 });
    if (!item.canonicalId || !["tcgdex", "scryfall"].includes(item.catalogSource ?? "")) {
      return Response.json({ error: "Este produto foi cadastrado manualmente. Confirme a edição exata na busca do catálogo antes de associar." }, { status: 422 });
    }
    const catalogSource = item.catalogSource!;
    const [existing] = await db.select({ variantId: externalListings.variantId }).from(externalListings)
      .innerJoin(sources, eq(sources.id, externalListings.sourceId))
      .where(and(eq(sources.organizationId, actor.organizationId), eq(sources.kind, catalogSource), eq(externalListings.variantId, item.variantId)))
      .limit(1);
    if (existing) return Response.json({ linked: true, observationsInserted: 0, message: "Esta edição já está associada ao catálogo." });

    const result = item.catalogSource === "scryfall"
      ? await linkScryfallAndCollect(actor.organizationId, inventoryItemId, item.canonicalId)
      : await linkAndCollect(actor.organizationId, { inventoryItemId, externalCardId: item.canonicalId, language: item.language });
    return Response.json({ linked: Boolean(result), observationsInserted: result?.observationsInserted ?? 0, message: "Edição associada ao catálogo. Preços internacionais não são cotações brasileiras." });
  } catch (error) {
    return authErrorResponse(error);
  }
}
