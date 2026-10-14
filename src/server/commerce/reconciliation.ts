import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  externalProductMappings,
  inventoryItems,
  products,
  productVariants,
} from "@/db/schema";
import type { CommerceProduct, ReconciledItem } from "./types";

/**
 * Normaliza strings para comparação fonética/textual desconsiderando acentos e pontuação.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Motor de Conciliação Inteligente para Importação de Catálogo Externo (ERP / E-commerce).
 * Classifica estritamente cada item como exact_match, probable_match, new_product, conflict ou insufficient_data.
 */
export async function reconcileCommerceProducts(
  organizationId: string,
  connectionId: string,
  externalProducts: CommerceProduct[]
): Promise<ReconciledItem[]> {
  if (externalProducts.length === 0) return [];

  // 1. Carregar mapeamentos externos já existentes para esta conexão
  const externalIds = externalProducts.map((p) => p.externalId);
  const existingMappings = await db
    .select({
      id: externalProductMappings.id,
      externalId: externalProductMappings.externalId,
      externalVariantId: externalProductMappings.externalVariantId,
      inventoryItemId: externalProductMappings.inventoryItemId,
    })
    .from(externalProductMappings)
    .where(
      and(
        eq(externalProductMappings.organizationId, organizationId),
        eq(externalProductMappings.connectionId, connectionId),
        inArray(externalProductMappings.externalId, externalIds)
      )
    );

  const mappingKey = (externalId: string, variantId?: string | null) => `${externalId}:${variantId ?? ""}`;
  const mappingByExternalId = new Map(existingMappings.map((m) => [mappingKey(m.externalId, m.externalVariantId), m]));

  // 2. Carregar inventário da própria organização para busca por SKU e atributos
  const existingOrgItems = await db
    .select({
      inventoryId: inventoryItems.id,
      organizationSku: inventoryItems.organizationSku,
      cost: inventoryItems.cost,
      price: inventoryItems.price,
      quantity: inventoryItems.quantity,
      variantId: productVariants.id,
      variantSku: productVariants.sku,
      productName: products.name,
      category: products.category,
      setName: productVariants.setName,
      collectorNumber: productVariants.collectorNumber,
      language: productVariants.language,
      condition: productVariants.condition,
      finish: productVariants.finish,
    })
    .from(inventoryItems)
    .innerJoin(productVariants, eq(productVariants.id, inventoryItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(inventoryItems.organizationId, organizationId));

  const itemByOrgSku = new Map<string, (typeof existingOrgItems)[0]>();
  const itemById = new Map<string, (typeof existingOrgItems)[0]>();

  for (const item of existingOrgItems) {
    itemById.set(item.inventoryId, item);
    if (item.organizationSku) {
      itemByOrgSku.set(item.organizationSku.trim().toUpperCase(), item);
    }
  }

  const results: ReconciledItem[] = [];
  const skuCounts = new Map<string, number>();
  for (const p of externalProducts) {
    if (p.sku?.trim()) {
      const key = p.sku.trim().toUpperCase();
      skuCounts.set(key, (skuCounts.get(key) ?? 0) + 1);
    }
  }

  for (const p of externalProducts) {
    const rawPrice = p.price ? parseFloat(p.price) : null;
    const price = rawPrice !== null && !isNaN(rawPrice) && rawPrice >= 0 ? rawPrice : null;
    const rawCost = p.cost ? parseFloat(p.cost) : null;
    const cost = rawCost !== null && !isNaN(rawCost) && rawCost >= 0 ? rawCost : null;
    const quantity = p.quantity !== null && p.quantity !== undefined ? Math.max(0, p.quantity) : null;

    const language = p.language?.trim() || "pt-BR";
    const condition = p.condition?.trim() || "NM";
    const finish = p.finish?.trim() || "standard";

    if (p.sku && (skuCounts.get(p.sku.trim().toUpperCase()) ?? 0) > 1) {
      results.push({
        externalId: p.externalId, externalVariantId: p.externalVariantId,
        name: p.name, sku: p.sku, barcode: p.barcode, category: p.category,
        price, cost, quantity, language, condition, finish,
        setName: p.setName, collectorNumber: p.collectorNumber,
        status: "conflict", reason: "SKU duplicado na mesma página do catálogo WooCommerce.",
      });
      continue;
    }

    // Regra 1: Dados insuficientes (sem nome ou sem preço e sem estoque)
    if (!p.name || (!p.sku && !p.barcode && !p.setName)) {
      results.push({
        externalId: p.externalId,
        externalVariantId: p.externalVariantId,
        name: p.name || "Produto sem identificação",
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        price,
        cost,
        quantity,
        language,
        condition,
        finish,
        setName: p.setName,
        collectorNumber: p.collectorNumber,
        status: "insufficient_data",
        reason: "Produto sem SKU, código de barras ou dados de coleção suficientes.",
      });
      continue;
    }

    // Regra 2: Mapeamento externo pré-existente
    const existingMapping = mappingByExternalId.get(mappingKey(p.externalId, p.externalVariantId));
    if (existingMapping) {
      const mappedItem = itemById.get(existingMapping.inventoryItemId);
      if (mappedItem) {
        results.push({
          externalId: p.externalId,
          externalVariantId: p.externalVariantId,
          name: p.name,
          sku: p.sku || mappedItem.organizationSku,
          barcode: p.barcode,
          category: p.category || mappedItem.category,
          price,
          cost,
          quantity,
          language,
          condition,
          finish,
          setName: p.setName || mappedItem.setName,
          collectorNumber: p.collectorNumber || mappedItem.collectorNumber,
          status: "exact_match",
          reason: "Vínculo externo já mapeado anteriormente.",
          matchedInventoryItemId: mappedItem.inventoryId,
          matchedProductName: mappedItem.productName,
          matchedVariantId: mappedItem.variantId,
          currentGeekPrice: Number(mappedItem.price),
          currentCost: Number(mappedItem.cost),
          currentStock: mappedItem.quantity,
        });
        continue;
      }
    }

    // Regra 3: Correspondência por SKU da organização
    if (p.sku) {
      const cleanSku = p.sku.trim().toUpperCase();
      const skuMatch = itemByOrgSku.get(cleanSku);

      if (skuMatch) {
        const normExternalName = normalizeText(p.name);
        const normOrgName = normalizeText(skuMatch.productName);

        // Se o nome ou categoria for totalmente conflitante (ex: "Display Pokémon" vs "Camisa Nerd")
        const wordsExt = new Set(normExternalName.split(" "));
        const wordsOrg = normOrgName.split(" ");
        const commonWords = wordsOrg.filter((w) => w.length > 2 && wordsExt.has(w));

        if (commonWords.length === 0 && normExternalName !== normOrgName) {
          results.push({
            externalId: p.externalId,
            externalVariantId: p.externalVariantId,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            category: p.category,
            price,
            cost,
            quantity,
            language,
            condition,
            finish,
            setName: p.setName,
            collectorNumber: p.collectorNumber,
            status: "conflict",
            reason: "Mesmo SKU da loja cadastrado para produto com nome incompatível.",
            matchedInventoryItemId: skuMatch.inventoryId,
            matchedProductName: skuMatch.productName,
            conflictDetails: `SKU "${p.sku}" já pertence a "${skuMatch.productName}" no GeekPrice.`,
          });
          continue;
        }

        results.push({
          externalId: p.externalId,
          externalVariantId: p.externalVariantId,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category || skuMatch.category,
          price,
          cost,
          quantity,
          language,
          condition,
          finish,
          setName: p.setName || skuMatch.setName,
          collectorNumber: p.collectorNumber || skuMatch.collectorNumber,
          status: "exact_match",
          reason: "Correspondência exata por SKU interno da loja.",
          matchedInventoryItemId: skuMatch.inventoryId,
          matchedProductName: skuMatch.productName,
          matchedVariantId: skuMatch.variantId,
          currentGeekPrice: Number(skuMatch.price),
          currentCost: Number(skuMatch.cost),
          currentStock: skuMatch.quantity,
        });
        continue;
      }
    }

    // Regra 4: Correspondência Provável (Nome similar e mesma coleção/número, mas sem SKU coincidente)
    let probableMatch: (typeof existingOrgItems)[0] | null = null;
    const normName = normalizeText(p.name);

    if (p.setName && p.collectorNumber) {
      probableMatch =
        existingOrgItems.find((item) => {
          if (!item.setName || !item.collectorNumber) return false;
          const sameSet = normalizeText(item.setName) === normalizeText(p.setName!);
          const sameNumber = item.collectorNumber.trim() === p.collectorNumber!.trim();
          return sameSet && sameNumber;
        }) || null;
    }

    if (!probableMatch && normName.length > 5) {
      probableMatch =
        existingOrgItems.find((item) => {
          const itemNorm = normalizeText(item.productName);
          return itemNorm === normName && item.category === p.category;
        }) || null;
    }

    if (probableMatch) {
      results.push({
        externalId: p.externalId,
        externalVariantId: p.externalVariantId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category || probableMatch.category,
        price,
        cost,
        quantity,
        language,
        condition,
        finish,
        setName: p.setName || probableMatch.setName,
        collectorNumber: p.collectorNumber || probableMatch.collectorNumber,
        status: "probable_match",
        reason: "Nome e atributos semelhantes encontrados no estoque. Confirmação do lojista necessária.",
        matchedInventoryItemId: probableMatch.inventoryId,
        matchedProductName: probableMatch.productName,
        matchedVariantId: probableMatch.variantId,
        currentGeekPrice: Number(probableMatch.price),
        currentCost: Number(probableMatch.cost),
        currentStock: probableMatch.quantity,
      });
      continue;
    }

    // Regra 5: Produto Novo
    results.push({
      externalId: p.externalId,
      externalVariantId: p.externalVariantId,
      name: p.name,
      sku: p.sku || `EXT-${p.externalId}${p.externalVariantId ? `-${p.externalVariantId}` : ""}`,
      barcode: p.barcode,
      category: p.category || "Geral",
      price,
      cost,
      quantity,
      language,
      condition,
      finish,
      setName: p.setName,
      collectorNumber: p.collectorNumber,
      status: "new_product",
      reason: "Nenhum produto correspondente encontrado. Pronto para cadastro novo no estoque.",
    });
  }

  return results;
}
