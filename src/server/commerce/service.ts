import "server-only";

import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  externalProductMappings,
  commercePreviews,
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
} from "./types";
import { WooCommerceConnector, type WooCommerceCredentials } from "./woocommerce";

function getSigningSecret(): string {
  const secret = process.env.COMMERCE_PREVIEW_SIGNING_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Chave de assinatura de preview não configurada.");
  return secret;
}

function generatePreviewToken(payload: {
  connectionId: string;
  organizationId: string;
  previewId: string;
  hash: string;
  sourceHash: string;
  page: number;
  perPage: number;
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
  previewId: string;
  hash: string;
  sourceHash: string;
  page: number;
  perPage: number;
  itemsCount: number;
  expiresAt: number;
} {
  const [dataB64, signature] = token.split(".");
  if (!dataB64 || !signature) {
    throw new Error("Token de pré-visualização inválido.");
  }

  const data = Buffer.from(dataB64, "base64url").toString("utf8");
  const expectedSig = createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
  if (signature.length !== expectedSig.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
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

function snapshotHash(items: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)]));
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonical(items))).digest("hex");
}

export async function generateCommerceImportPreview(
  organizationId: string,
  connectionId: string,
  options?: { page?: number; perPage?: number },
  userId?: string
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

  const hash = snapshotHash(reconciledItems);

  const expiresAt = Date.now() + 15 * 60 * 1000;
  const previewId = randomUUID();
  await db.insert(commercePreviews).values({
    id: previewId,
    organizationId,
    connectionId,
    createdById: userId ?? null,
    payloadHash: hash,
    snapshot: reconciledItems,
    expiresAt: new Date(expiresAt),
  });
  const previewToken = generatePreviewToken({
    connectionId,
    organizationId,
    previewId,
    hash,
    sourceHash: snapshotHash(pullResult.items),
    page: options?.page || 1,
    perPage: options?.perPage || 100,
    itemsCount: reconciledItems.length,
    expiresAt,
  });

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

  // Revalidação externa anterior à transação: falha fechada se a origem mudou ou caiu.
  const sourceConnector = await getConnectorForConnection(organizationId, input.connectionId);
  const currentSource = await sourceConnector.pullProducts({
    cursor: null, updatedAfter: null, page: tokenPayload.page, perPage: tokenPayload.perPage,
  });
  if (snapshotHash(currentSource.items) !== tokenPayload.sourceHash) {
    throw new Error("Catálogo WooCommerce alterado desde o preview. Gere uma nova pré-visualização.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from commerce_previews where id = ${tokenPayload.previewId}::uuid for update`);
    const [preview] = await tx.select().from(commercePreviews).where(and(
      eq(commercePreviews.id, tokenPayload.previewId),
      eq(commercePreviews.organizationId, organizationId),
      eq(commercePreviews.connectionId, input.connectionId),
    )).limit(1);
    if (!preview) throw new Error("Pré-visualização não encontrada para esta organização.");
    if (preview.status !== "pending") throw new Error("Pré-visualização já confirmada ou indisponível.");
    if (Date.now() > preview.expiresAt.getTime()) throw new Error("Pré-visualização expirada. Gere uma nova.");
    if (preview.createdById && preview.createdById !== userId) throw new Error("Pré-visualização pertence a outro usuário.");
    let itemsToProcess = preview.snapshot;
    if (snapshotHash(itemsToProcess) !== preview.payloadHash || preview.payloadHash !== tokenPayload.hash || itemsToProcess.length !== tokenPayload.itemsCount) {
      throw new Error("Snapshot de pré-visualização divergente do token aprovado.");
    }

  // Filtrar itens selecionados se informado
  if (input.selectedExternalIds) {
    const selectedSet = new Set(input.selectedExternalIds);
    if (selectedSet.size === 0) throw new Error("Nenhum produto selecionado para importação.");
    if (selectedSet.size !== input.selectedExternalIds.length || ![...selectedSet].every((id) => itemsToProcess.some((item) => item.externalId === id))) {
      throw new Error("Seleção contém itens duplicados ou ausentes no preview.");
    }
    itemsToProcess = itemsToProcess.filter((i) => selectedSet.has(i.externalId));
  }

  // Mapear confirmações explícitas de prováveis correspondências
  const confirmedProbable = new Map<string, string>();
  if (input.confirmedProbableMatches) {
    for (const match of input.confirmedProbableMatches) {
      const expected = itemsToProcess.find((item) => item.externalId === match.externalId);
      if (!expected || expected.status !== "probable_match" || expected.matchedInventoryItemId !== match.inventoryItemId || confirmedProbable.has(match.externalId)) {
        throw new Error("Confirmação provável divergente do preview aprovado.");
      }
      confirmedProbable.set(match.externalId, match.inventoryItemId);
    }
  }

  // 1. Criar registro de sync run
  const [syncRun] = await tx
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
  const errorCount = 0;
  const errors: Array<{ externalId?: string; message: string }> = [];

      // Bloqueio por organização para integridade serializada
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);

      for (const item of itemsToProcess) {
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
            // O ID confirmado deve coincidir com o snapshot; não mutar o snapshot persistido.
          }

          const itemHash = createHash("sha256")
            .update(JSON.stringify({ p: item.price, q: item.quantity, s: item.sku }))
            .digest("hex");

          if (item.matchedInventoryItemId) {
            const [current] = await tx.select({
              price: inventoryItems.price, cost: inventoryItems.cost, quantity: inventoryItems.quantity,
              sku: inventoryItems.organizationSku,
            }).from(inventoryItems).where(and(
              eq(inventoryItems.id, item.matchedInventoryItemId),
              eq(inventoryItems.organizationId, organizationId),
            )).limit(1);
            if (!current || Number(current.price) !== item.currentGeekPrice || Number(current.cost) !== item.currentCost || current.quantity !== item.currentStock || (item.sku && current.sku !== item.sku)) {
              throw new Error(`Inventário alterado desde o preview para ${item.externalId}. Gere nova prévia.`);
            }
            // Atualizar estoque do item existente (SOMENTE LEITURA em relação ao e-commerce)
            // Atualiza preço de venda se presente e estoque; NUNCA inventa ou sobrescreve custo se ausente
            const updateFields: Record<string, unknown> = { updatedAt: new Date() };
            if (item.quantity !== null) updateFields.quantity = item.quantity;
            // Preço e custo locais pertencem à política do lojista; importação atualiza só estoque.

            await tx
              .update(inventoryItems)
              .set(updateFields)
              .where(
                and(
                  eq(inventoryItems.id, item.matchedInventoryItemId),
                  eq(inventoryItems.organizationId, organizationId)
                )
              );

            // Nunca reassociar silenciosamente um item já vinculado a outro produto externo.
            const [existingMapping] = await tx.select().from(externalProductMappings).where(and(
              eq(externalProductMappings.organizationId, organizationId),
              eq(externalProductMappings.connectionId, input.connectionId),
              eq(externalProductMappings.inventoryItemId, item.matchedInventoryItemId),
            )).limit(1);
            if (existingMapping && (existingMapping.externalId !== item.externalId || (existingMapping.externalVariantId ?? null) !== (item.externalVariantId ?? null))) {
              throw new Error(`Mapeamento externo divergente para ${item.externalId}.`);
            }
            if (existingMapping) {
              await tx.update(externalProductMappings).set({
                sourceUpdatedAt: new Date(), lastImportedHash: itemHash, updatedAt: new Date(),
              }).where(eq(externalProductMappings.id, existingMapping.id));
            } else {
              await tx.insert(externalProductMappings).values({
                organizationId, connectionId: input.connectionId,
                inventoryItemId: item.matchedInventoryItemId, externalId: item.externalId,
                externalVariantId: item.externalVariantId || null,
                sourceUpdatedAt: new Date(), lastImportedHash: itemHash,
              });
            }

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

            const fallbackSku = `EXT-${item.externalId}${item.externalVariantId ? `-${item.externalVariantId}` : ""}`;
            const scopedSku = organizationScopedSku(organizationId, item.sku || fallbackSku);

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
                organizationSku: item.sku || fallbackSku,
                cost: initialCost,
                price: initialPrice,
                quantity: item.quantity ?? 0,
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
      }

    const finalStatus: "completed" | "partial" | "failed" =
      errorCount > 0 && createdCount + updatedCount > 0 ? "partial" : errorCount > 0 ? "failed" : "completed";

    await tx
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

    await tx
      .update(integrationConnections)
      .set({
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, input.connectionId));

    await tx.update(commercePreviews).set({
      status: "committed", consumedAt: new Date(), importRunId: syncRun.id,
    }).where(eq(commercePreviews.id, preview.id));

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
  });
}
