import "server-only";

import { createHmac, createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  externalProductMappings,
  integrationConnections,
  inventoryItems,
  products,
  productVariants,
  syncRuns,
} from "@/db/schema";
import { organizationScopedSku } from "@/server/inventory/scoped-sku";
import { decryptCredentials, encryptCredentials } from "./credentials";
import { reconcileCommerceProducts } from "./reconciliation";
import type {
  CommerceConnector,
  ImportCommitInput,
  ImportCommitResult,
  ImportPreviewResult,
  ReconciledItem,
} from "./types";
import { WooCommerceConnector, type WooCommerceCredentials } from "./woocommerce";

function getSigningSecret(): string {
  return process.env.NEXTAUTH_SECRET || "fallback-secret-for-signing-only";
}

function generatePreviewToken(payload: {
  connectionId: string;
  organizationId: string;
  hash: string;
  itemsCount: number;
  expiresAt: number;
}): string {
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
  return `${Buffer.from(data).toString("base64url")}.${signature}`;
}

function verifyPreviewToken(token: string): {
  connectionId: string;
  organizationId: string;
  hash: string;
  itemsCount: number;
  expiresAt: number;
} {
  const [dataB64, signature] = token.split(".");
  if (!dataB64 || !signature) {
    throw new Error("Token de pré-visualização inválido.");
  }

  const data = Buffer.from(dataB64, "base64url").toString("utf8");
  const expectedSig = createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
  if (signature !== expectedSig) {
    throw new Error("Assinatura do token de pré-visualização inválida ou adulterada.");
  }

  const payload = JSON.parse(data);
  if (Date.now() > payload.expiresAt) {
    throw new Error("A pré-visualização expirou (limite de 15 minutos). Gere uma nova pré-visualização.");
  }

  return payload;
}

export async function listOrganizationConnections(organizationId: string) {
  const connections = await db
    .select({
      id: integrationConnections.id,
      kind: integrationConnections.kind,
      name: integrationConnections.name,
      mode: integrationConnections.mode,
      active: integrationConnections.active,
      lastCursor: integrationConnections.lastCursor,
      lastSyncedAt: integrationConnections.lastSyncedAt,
      createdAt: integrationConnections.createdAt,
      updatedAt: integrationConnections.updatedAt,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, organizationId))
    .orderBy(desc(integrationConnections.createdAt));

  return connections;
}

export async function createWooCommerceConnection(
  organizationId: string,
  input: {
    name: string;
    storeUrl: string;
    consumerKey: string;
    consumerSecret: string;
  }
) {
  // Testar conector antes de persistir
  const connector = new WooCommerceConnector({
    storeUrl: input.storeUrl,
    consumerKey: input.consumerKey,
    consumerSecret: input.consumerSecret,
  });

  const testResult = await connector.testConnection();

  const encrypted = encryptCredentials({
    storeUrl: input.storeUrl.trim(),
    consumerKey: input.consumerKey.trim(),
    consumerSecret: input.consumerSecret.trim(),
  });

  const [connection] = await db
    .insert(integrationConnections)
    .values({
      organizationId,
      kind: "woocommerce",
      name: input.name.trim(),
      mode: "read_only",
      encryptedCredentials: encrypted,
      active: testResult.ok,
    })
    .returning({
      id: integrationConnections.id,
      kind: integrationConnections.kind,
      name: integrationConnections.name,
      mode: integrationConnections.mode,
      active: integrationConnections.active,
      lastSyncedAt: integrationConnections.lastSyncedAt,
    });

  return { connection, testResult };
}

export async function deleteOrganizationConnection(organizationId: string, connectionId: string) {
  const [deleted] = await db
    .delete(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.organizationId, organizationId)
      )
    )
    .returning({ id: integrationConnections.id });

  return Boolean(deleted);
}

export async function getConnectorForConnection(
  organizationId: string,
  connectionId: string
): Promise<CommerceConnector> {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!connection) {
    throw new Error("Conexão de integração não encontrada para esta organização.");
  }

  const credentials = decryptCredentials(connection.encryptedCredentials);

  if (connection.kind === "woocommerce") {
    return new WooCommerceConnector(credentials as unknown as WooCommerceCredentials);
  }

  throw new Error(`Tipo de integração "${connection.kind}" ainda não homologado.`);
}

// Armazenamento em memória de curta duração para itens de preview assinados
const previewCache = new Map<string, { items: ReconciledItem[]; expiresAt: number }>();

export async function generateCommerceImportPreview(
  organizationId: string,
  connectionId: string,
  options?: { page?: number; perPage?: number }
): Promise<ImportPreviewResult> {
  const connector = await getConnectorForConnection(organizationId, connectionId);

  const pullResult = await connector.pullProducts({
    cursor: null,
    updatedAfter: null,
    page: options?.page || 1,
    perPage: options?.perPage || 100,
  });

  const reconciledItems = await reconcileCommerceProducts(
    organizationId,
    connectionId,
    pullResult.items
  );

  let exactMatches = 0;
  let probableMatches = 0;
  let newProducts = 0;
  let conflicts = 0;
  let insufficientData = 0;

  for (const item of reconciledItems) {
    if (item.status === "exact_match") exactMatches++;
    else if (item.status === "probable_match") probableMatches++;
    else if (item.status === "new_product") newProducts++;
    else if (item.status === "conflict") conflicts++;
    else if (item.status === "insufficient_data") insufficientData++;
  }

  const hash = createHash("sha256")
    .update(JSON.stringify(reconciledItems.map((i) => ({ id: i.externalId, s: i.status }))))
    .digest("hex");

  const expiresAt = Date.now() + 15 * 60 * 1000;
  const previewToken = generatePreviewToken({
    connectionId,
    organizationId,
    hash,
    itemsCount: reconciledItems.length,
    expiresAt,
  });

  previewCache.set(previewToken, { items: reconciledItems, expiresAt });

  return {
    connectionId,
    provider: connector.kind,
    totalFetched: reconciledItems.length,
    exactMatches,
    probableMatches,
    newProducts,
    conflicts,
    insufficientData,
    items: reconciledItems,
    previewToken,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function commitCommerceImport(
  organizationId: string,
  userId: string | null,
  input: ImportCommitInput
): Promise<ImportCommitResult> {
  const tokenPayload = verifyPreviewToken(input.previewToken);
  if (tokenPayload.organizationId !== organizationId) {
    throw new Error("Permissão negada: o preview pertence a outra organização.");
  }
  if (tokenPayload.connectionId !== input.connectionId) {
    throw new Error("Conexão divergente do preview aprovado.");
  }

  const cached = previewCache.get(input.previewToken);
  let itemsToProcess = cached?.items;

  // Se o cache local expirou ou reiniciou, re-consulta com o mesmo conector
  if (!itemsToProcess) {
    const preview = await generateCommerceImportPreview(organizationId, input.connectionId);
    itemsToProcess = preview.items;
  }

  // Filtrar itens selecionados se informado
  if (input.selectedExternalIds && input.selectedExternalIds.length > 0) {
    const selectedSet = new Set(input.selectedExternalIds);
    itemsToProcess = itemsToProcess.filter((i) => selectedSet.has(i.externalId));
  }

  // Mapear confirmações explícitas de prováveis correspondências
  const confirmedProbable = new Map<string, string>();
  if (input.confirmedProbableMatches) {
    for (const match of input.confirmedProbableMatches) {
      confirmedProbable.set(match.externalId, match.inventoryItemId);
    }
  }

  // 1. Criar registro de sync run
  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      organizationId,
      connectionId: input.connectionId,
      status: "running",
      source: "woocommerce",
      cursorBefore: null,
      startedAt: new Date(),
    })
    .returning();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let conflictCount = 0;
  let errorCount = 0;
  const errors: Array<{ externalId?: string; message: string }> = [];

  try {
    await db.transaction(async (tx) => {
      // Bloqueio por organização para integridade serializada
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);

      for (const item of itemsToProcess) {
        try {
          if (item.status === "insufficient_data") {
            skippedCount++;
            continue;
          }

          if (item.status === "conflict") {
            conflictCount++;
            errors.push({ externalId: item.externalId, message: item.reason });
            continue;
          }

          // Tratamento de Probable Match: só importa se houver confirmação explícita
          if (item.status === "probable_match") {
            const confirmedInventoryId = confirmedProbable.get(item.externalId);
            if (!confirmedInventoryId) {
              skippedCount++;
              continue; // Rejeitado ou não confirmado pelo lojista
            }
            // Confirmado: tratar como vínculo e atualização
            item.matchedInventoryItemId = confirmedInventoryId;
          }

          const itemHash = createHash("sha256")
            .update(JSON.stringify({ p: item.price, q: item.quantity, s: item.sku }))
            .digest("hex");

          if (item.matchedInventoryItemId) {
            // Atualizar estoque do item existente (SOMENTE LEITURA em relação ao e-commerce)
            // Atualiza preço de venda se presente e estoque; NUNCA inventa ou sobrescreve custo se ausente
            const updateFields: Record<string, unknown> = {
              quantity: item.quantity,
              updatedAt: new Date(),
            };
            if (item.price !== null && item.price > 0) {
              updateFields.price = item.price.toFixed(2);
            }
            if (item.cost !== null && item.cost > 0) {
              updateFields.cost = item.cost.toFixed(2);
            }

            await tx
              .update(inventoryItems)
              .set(updateFields)
              .where(
                and(
                  eq(inventoryItems.id, item.matchedInventoryItemId),
                  eq(inventoryItems.organizationId, organizationId)
                )
              );

            // Gravar ou atualizar mapeamento externo
            await tx
              .insert(externalProductMappings)
              .values({
                organizationId,
                connectionId: input.connectionId,
                inventoryItemId: item.matchedInventoryItemId,
                externalId: item.externalId,
                externalVariantId: item.externalVariantId || null,
                sourceUpdatedAt: new Date(),
                lastImportedHash: itemHash,
              })
              .onConflictDoUpdate({
                target: [
                  externalProductMappings.connectionId,
                  externalProductMappings.externalId,
                  externalProductMappings.externalVariantId,
                ],
                set: {
                  inventoryItemId: item.matchedInventoryItemId,
                  sourceUpdatedAt: new Date(),
                  lastImportedHash: itemHash,
                  updatedAt: new Date(),
                },
              });

            updatedCount++;
          } else if (item.status === "new_product") {
            // Cadastrar produto novo
            const [newProd] = await tx
              .insert(products)
              .values({
                name: item.name,
                category: item.category || "Geral",
              })
              .returning({ id: products.id });

            const scopedSku = organizationScopedSku(organizationId, item.sku || `EXT-${item.externalId}`);

            const [newVariant] = await tx
              .insert(productVariants)
              .values({
                productId: newProd.id,
                sku: scopedSku,
                setName: item.setName || null,
                collectorNumber: item.collectorNumber || null,
                language: item.language,
                condition: item.condition,
                finish: item.finish,
              })
              .returning({ id: productVariants.id });

            const initialCost = item.cost !== null && item.cost > 0 ? item.cost.toFixed(2) : "0.00";
            const initialPrice = item.price !== null && item.price > 0 ? item.price.toFixed(2) : "1.00";

            const [newInvItem] = await tx
              .insert(inventoryItems)
              .values({
                organizationId,
                variantId: newVariant.id,
                organizationSku: item.sku || `EXT-${item.externalId}`,
                cost: initialCost,
                price: initialPrice,
                quantity: item.quantity,
                desiredMarginPercent: "25.00",
              })
              .returning({ id: inventoryItems.id });

            // Registrar mapeamento
            await tx.insert(externalProductMappings).values({
              organizationId,
              connectionId: input.connectionId,
              inventoryItemId: newInvItem.id,
              externalId: item.externalId,
              externalVariantId: item.externalVariantId || null,
              sourceUpdatedAt: new Date(),
              lastImportedHash: itemHash,
            });

            createdCount++;
          }
        } catch (itemErr: unknown) {
          errorCount++;
          errors.push({
            externalId: item.externalId,
            message: itemErr instanceof Error ? itemErr.message : String(itemErr),
          });
        }
      }
    });

    const finalStatus: "completed" | "partial" | "failed" =
      errorCount > 0 && createdCount + updatedCount > 0 ? "partial" : errorCount > 0 ? "failed" : "completed";

    await db
      .update(syncRuns)
      .set({
        status: finalStatus,
        createdCount,
        updatedCount,
        skippedCount,
        conflictCount,
        errorCount,
        errors,
        completedAt: new Date(),
      })
      .where(eq(syncRuns.id, syncRun.id));

    await db
      .update(integrationConnections)
      .set({
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, input.connectionId));

    // Limpar preview após uso
    previewCache.delete(input.previewToken);

    return {
      syncRunId: syncRun.id,
      status: finalStatus,
      createdCount,
      updatedCount,
      skippedCount,
      conflictCount,
      errorCount,
      errors,
    };
  } catch (fatalErr: unknown) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        errorCount: errorCount + 1,
        errors: [{ message: fatalErr instanceof Error ? fatalErr.message : String(fatalErr) }],
        completedAt: new Date(),
      })
      .where(eq(syncRuns.id, syncRun.id));

    throw fatalErr;
  }
}
