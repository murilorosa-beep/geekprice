import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  inventoryItems,
  externalListings,
  priceObservations,
  products,
  productVariants,
  sources,
} from "@/db/schema";
import type { BrlMarketRowInput } from "./partner-csv";

export class BrlMarketImportError extends Error {}

export async function importBrlMarketReferences(
  organizationId: string,
  rows: BrlMarketRowInput[]
) {
  if (rows.length === 0) {
    return { insertedObservations: 0, matchedVariants: 0, totalRows: 0 };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 2))`);
    // 1. Obter ou criar fontes (sources)
    const uniqueSourceNames = Array.from(new Set(rows.map((r) => r.sourceName)));
    const sourceMap = new Map<string, string>();

    for (const sourceName of uniqueSourceNames) {
      const [existingSource] = await tx
        .select({ id: sources.id, active: sources.active, config: sources.config })
        .from(sources)
        .where(
          and(
            eq(sources.name, sourceName),
            eq(sources.kind, "partner_csv"),
            eq(sources.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existingSource) {
        if (!existingSource.active || existingSource.config?.type !== "private" || existingSource.config?.verified === true) {
          throw new BrlMarketImportError("Esta fonte nao autoriza importacoes privadas por CSV.");
        }
        sourceMap.set(sourceName, existingSource.id);
      } else {
        const [createdSource] = await tx
          .insert(sources)
          .values({
            organizationId,
            name: sourceName,
            kind: "partner_csv",
            active: true,
            config: { region: "BR", currency: "BRL", type: "private", verified: false },
          })
          .returning({ id: sources.id });
        sourceMap.set(sourceName, createdSource.id);
      }
    }

    let insertedObservations = 0;
    let matchedVariants = 0;

    // 2. Processar cada linha
    for (const row of rows) {
      const sourceId = sourceMap.get(row.sourceName)!;

      // Buscar variante correspondente por nome, set e número de colecionador
      const filters = [eq(products.name, row.productName), eq(inventoryItems.organizationId, organizationId), eq(productVariants.language, row.language), eq(productVariants.condition, row.condition), eq(productVariants.finish, row.finish)];
      if (row.setName) {
        filters.push(eq(productVariants.setName, row.setName));
      }
      if (row.collectorNumber) {
        filters.push(eq(productVariants.collectorNumber, row.collectorNumber));
      }

      const matchingVariants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
        .where(and(...filters))
        .limit(2);

      if (matchingVariants.length > 1) {
        throw new BrlMarketImportError("Produto ambiguo: informe colecao e numero exatos.");
      }
      const existingVariant = matchingVariants[0];

      let variantId: string;

      if (existingVariant) {
        variantId = existingVariant.id;
        matchedVariants++;
      } else {
        throw new BrlMarketImportError("Produto ou variante nao encontrado no estoque desta organizacao.");
      }

      // Upsert listing externo
      const externalKey = `br-market:${variantId}:${row.sourceName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`.slice(0, 240);

      const [listing] = await tx
        .insert(externalListings)
        .values({
          sourceId,
          variantId,
          externalId: externalKey,
          url: row.url || null,
          sellerName: row.sourceName,
          metadata: {
            sourceName: row.sourceName,
            trust: "private_unverified",
            importedAt: new Date().toISOString(),
          },
        })
        .onConflictDoUpdate({
          target: [externalListings.sourceId, externalListings.externalId],
          set: {
            variantId,
            url: row.url || null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: externalListings.id });

      // Inserir observação de preço em BRL
      const fingerprint = createHash("sha256")
        .update(
          [
            listing.id,
            row.priceType,
            row.price.toFixed(2),
            row.referenceAt.toISOString().slice(0, 10),
          ].join("|")
        )
        .digest("hex");

      const inserted = await tx
        .insert(priceObservations)
        .values({
          listingId: listing.id,
          price: row.price.toFixed(2),
          shippingPrice: (row.shippingPrice ?? 0).toFixed(2),
          currency: "BRL",
          region: "BR",
          type: row.priceType,
          condition: row.condition,
          finish: row.finish,
          referenceAt: row.referenceAt,
          fingerprint,
          available: true,
          rawPayload: {
            url: row.url || null,
            sourceName: row.sourceName,
          },
        })
        .onConflictDoNothing({ target: priceObservations.fingerprint })
        .returning({ id: priceObservations.id });

      if (inserted.length > 0) {
        insertedObservations++;
      }
    }

    // Criar alerta de auditoria
    await tx.insert(alerts).values({
      organizationId,
      severity: "info",
      title: "Importação de Referências de Mercado BRL",
      message: `Foram processadas ${rows.length} linhas de mercado em BRL. ${insertedObservations} novas cotações registradas e ${matchedVariants} variantes existentes vinculadas.`,
    });

    return {
      insertedObservations,
      matchedVariants,
      totalRows: rows.length,
    };
  });
}
