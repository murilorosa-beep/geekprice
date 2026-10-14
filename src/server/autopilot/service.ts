import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  alerts,
  priceChangeBatches,
  priceChangeHistory,
  pricingRules,
  users,
} from "@/db/schema";
import {
  calculateRecommendation,
  type PriceRoundingMode,
  type PriceSafetyStatus,
} from "@/lib/pricing";
import { listAllInventory } from "@/server/inventory/service";
import { getActivePricingPolicy } from "@/server/settings/service";
import type { z } from "zod";
import type {
  applyBatchInputSchema,
  createPricingRuleSchema,
  updatePricingRuleSchema,
} from "./schemas";

export type PricingRuleRecord = typeof pricingRules.$inferSelect;

export class AutopilotConflictError extends Error {}
export class AutopilotValidationError extends Error {}
export class AutopilotNotFoundError extends Error {}

export function isRuleEligibleForAutoApply(
  ruleId: string | null,
  rules: Array<Pick<PricingRuleRecord, "id" | "autoApplySafe">>,
) {
  return Boolean(ruleId && rules.some((rule) => rule.id === ruleId && rule.autoApplySafe));
}

export type AutopilotItemView = {
  id: string;
  name: string;
  category: string;
  sku: string;
  set: string | null;
  code: string | null;
  finish: string;
  rarity: string | null;
  cost: number;
  currentPrice: number;
  marketPrice: number | null;
  minimumPrice: number;
  suggestedPrice: number;
  rawSuggestedPrice: number;
  projectedMargin: number;
  priceDifference: number;
  percentageChange: number;
  safetyStatus: PriceSafetyStatus;
  safetyGate: string;
  safetyReason: string;
  safetyFlag: string | null;
  ruleId: string | null;
  ruleName: string;
  channel: "counter" | "ecommerce" | "marketplace";
  roundingMode: PriceRoundingMode;
  stock: number;
};

export type AutopilotQueueResult = {
  channel: "counter" | "ecommerce" | "marketplace";
  safe: AutopilotItemView[];
  flagged: AutopilotItemView[];
  unchanged: AutopilotItemView[];
  stats: {
    totalItems: number;
    safeCount: number;
    flaggedCount: number;
    unchangedCount: number;
    potentialRevenueImpact: number;
    averageProjectedMargin: number;
  };
};

export async function listPricingRules(organizationId: string): Promise<PricingRuleRecord[]> {
  return db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.organizationId, organizationId))
    .orderBy(desc(pricingRules.priority), desc(pricingRules.createdAt));
}

export async function createPricingRule(
  organizationId: string,
  input: z.infer<typeof createPricingRuleSchema>
) {
  const [created] = await db
    .insert(pricingRules)
    .values({
      organizationId,
      name: input.name,
      channel: input.channel,
      category: input.category || null,
      rarity: input.rarity || null,
      finish: input.finish || null,
      feePercent: input.feePercent.toFixed(4),
      additionalCostPercent: input.additionalCostPercent.toFixed(4),
      minimumMarginPercent: input.minimumMarginPercent.toFixed(4),
      desiredMarginPercent: input.desiredMarginPercent.toFixed(4),
      marketDiscountPercent: input.marketDiscountPercent.toFixed(4),
      maxChangePercent: input.maxChangePercent.toFixed(4),
      roundingMode: input.roundingMode,
      autoApplySafe: input.autoApplySafe,
      active: input.active,
      priority: input.priority,
    })
    .returning();
  return created;
}

export async function updatePricingRule(
  organizationId: string,
  ruleId: string,
  input: z.infer<typeof updatePricingRuleSchema>
) {
  const [current] = await db
    .select()
    .from(pricingRules)
    .where(and(eq(pricingRules.id, ruleId), eq(pricingRules.organizationId, organizationId)))
    .limit(1);
  if (!current) return null;

  const combinedPercent =
    (input.feePercent ?? Number(current.feePercent)) +
    (input.additionalCostPercent ?? Number(current.additionalCostPercent)) +
    (input.minimumMarginPercent ?? Number(current.minimumMarginPercent));
  if (combinedPercent >= 100) {
    throw new AutopilotValidationError(
      "A soma de taxas, custos adicionais e margem mínima deve ser menor que 100%.",
    );
  }

  const updateData: Partial<typeof pricingRules.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.channel !== undefined) updateData.channel = input.channel;
  if (input.category !== undefined) updateData.category = input.category || null;
  if (input.rarity !== undefined) updateData.rarity = input.rarity || null;
  if (input.finish !== undefined) updateData.finish = input.finish || null;
  if (input.feePercent !== undefined) updateData.feePercent = input.feePercent.toFixed(4);
  if (input.additionalCostPercent !== undefined)
    updateData.additionalCostPercent = input.additionalCostPercent.toFixed(4);
  if (input.minimumMarginPercent !== undefined)
    updateData.minimumMarginPercent = input.minimumMarginPercent.toFixed(4);
  if (input.desiredMarginPercent !== undefined)
    updateData.desiredMarginPercent = input.desiredMarginPercent.toFixed(4);
  if (input.marketDiscountPercent !== undefined)
    updateData.marketDiscountPercent = input.marketDiscountPercent.toFixed(4);
  if (input.maxChangePercent !== undefined)
    updateData.maxChangePercent = input.maxChangePercent.toFixed(4);
  if (input.roundingMode !== undefined) updateData.roundingMode = input.roundingMode;
  if (input.autoApplySafe !== undefined) updateData.autoApplySafe = input.autoApplySafe;
  if (input.active !== undefined) updateData.active = input.active;
  if (input.priority !== undefined) updateData.priority = input.priority;

  const [updated] = await db
    .update(pricingRules)
    .set(updateData)
    .where(and(eq(pricingRules.id, ruleId), eq(pricingRules.organizationId, organizationId)))
    .returning();
  return updated ?? null;
}

export async function deletePricingRule(organizationId: string, ruleId: string) {
  const [deleted] = await db
    .delete(pricingRules)
    .where(and(eq(pricingRules.id, ruleId), eq(pricingRules.organizationId, organizationId)))
    .returning({ id: pricingRules.id });
  return deleted ?? null;
}

export function matchRuleForItem(
  rules: PricingRuleRecord[],
  item: { category: string; rarity?: string | null; finish?: string | null },
  channel: "counter" | "ecommerce" | "marketplace"
): PricingRuleRecord | null {
  const channelRules = rules.filter((r) => r.active && r.channel === channel);
  if (channelRules.length === 0) return null;

  let bestRule: PricingRuleRecord | null = null;
  let bestScore = -1;

  for (const rule of channelRules) {
    let score = 0;
    let matches = true;

    if (rule.category) {
      if (rule.category.toLowerCase() === item.category.toLowerCase()) {
        score += 20;
      } else {
        matches = false;
      }
    }

    if (rule.finish) {
      if (item.finish && rule.finish.toLowerCase() === item.finish.toLowerCase()) {
        score += 15;
      } else {
        matches = false;
      }
    }

    if (rule.rarity) {
      if (item.rarity && rule.rarity.toLowerCase() === item.rarity.toLowerCase()) {
        score += 10;
      } else {
        matches = false;
      }
    }

    if (!matches) continue;

    const totalScore = score * 100 + rule.priority;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestRule = rule;
    }
  }

  return bestRule;
}

export type AutopilotPolicySettings = {
  feePercent: number;
  additionalCostPercent: number;
  minimumMarginPercent: number;
  desiredMarginPercent: number;
  marketDiscountPercent: number;
};

export type EvaluatedChunkResult = {
  safe: AutopilotItemView[];
  flagged: AutopilotItemView[];
  unchanged: AutopilotItemView[];
  potentialRevenueImpact: number;
  marginSum: number;
};

export function evaluateAutopilotItemChunk(
  items: Array<{
    id: string;
    name: string;
    category: string;
    sku: string;
    set?: string | null;
    code?: string | null;
    finish?: string | null;
    rarity?: string | null;
    cost: number;
    currentPrice: number;
    marketPrice: number | null;
    desiredMarginPercent: number;
    stock: number;
  }>,
  rules: PricingRuleRecord[],
  defaultPolicy: AutopilotPolicySettings,
  channel: "counter" | "ecommerce" | "marketplace" = "counter"
): EvaluatedChunkResult {
  const safe: AutopilotItemView[] = [];
  const flagged: AutopilotItemView[] = [];
  const unchanged: AutopilotItemView[] = [];
  let potentialRevenueImpact = 0;
  let marginSum = 0;

  for (const item of items) {
    const matchedRule = matchRuleForItem(rules, item, channel);

    const feePercent = matchedRule ? Number(matchedRule.feePercent) : defaultPolicy.feePercent;
    const additionalCostPercent = matchedRule
      ? Number(matchedRule.additionalCostPercent)
      : defaultPolicy.additionalCostPercent;
    const minimumMarginPercent = matchedRule
      ? Number(matchedRule.minimumMarginPercent)
      : defaultPolicy.minimumMarginPercent;
    const desiredMarginPercent = matchedRule
      ? Number(matchedRule.desiredMarginPercent)
      : Math.max(item.desiredMarginPercent, defaultPolicy.desiredMarginPercent);
    const marketDiscountPercent = matchedRule
      ? Number(matchedRule.marketDiscountPercent)
      : defaultPolicy.marketDiscountPercent;
    const maxChangePercent = matchedRule ? Number(matchedRule.maxChangePercent) : 15;
    const roundingMode: PriceRoundingMode = matchedRule
      ? (matchedRule.roundingMode as PriceRoundingMode)
      : "ends_90";

    const calc = calculateRecommendation({
      cost: item.cost,
      feesPercent: feePercent,
      additionalCostsPercent: additionalCostPercent,
      desiredMarginPercent,
      minimumMarginPercent,
      marketDiscountPercent,
      marketPrice: item.marketPrice,
      currentPrice: item.currentPrice,
      maxChangePercent,
      roundingMode,
    });

    const itemView: AutopilotItemView = {
      id: item.id,
      name: item.name,
      category: item.category,
      sku: item.sku,
      set: item.set ?? null,
      code: item.code ?? null,
      finish: item.finish ?? "standard",
      rarity: item.rarity ?? null,
      cost: item.cost,
      currentPrice: item.currentPrice,
      marketPrice: item.marketPrice,
      minimumPrice: calc.minimumPrice,
      suggestedPrice: calc.suggestedPrice,
      rawSuggestedPrice: calc.rawSuggestedPrice,
      projectedMargin: calc.projectedMargin,
      priceDifference: calc.priceDifference,
      percentageChange: calc.percentageChange,
      safetyStatus: calc.safetyStatus,
      safetyGate: calc.safetyGate,
      safetyReason: calc.safetyReason,
      safetyFlag: calc.safetyFlag,
      ruleId: matchedRule?.id ?? null,
      ruleName: matchedRule?.name ?? "Política Geral de Balcão",
      channel,
      roundingMode,
      stock: item.stock,
    };

    marginSum += calc.projectedMargin;
    potentialRevenueImpact += calc.priceDifference * item.stock;

    if (calc.safetyStatus === "safe_auto") {
      if (Math.abs(calc.priceDifference) < 0.01) {
        unchanged.push(itemView);
      } else {
        safe.push(itemView);
      }
    } else if (calc.safetyStatus === "unchanged") {
      unchanged.push(itemView);
    } else {
      flagged.push(itemView);
    }
  }

  return { safe, flagged, unchanged, potentialRevenueImpact, marginSum };
}

export async function getAutopilotQueue(
  organizationId: string,
  channel: "counter" | "ecommerce" | "marketplace" = "counter"
): Promise<AutopilotQueueResult> {
  const [inventory, rules, basePolicy] = await Promise.all([
    listAllInventory(organizationId),
    listPricingRules(organizationId),
    getActivePricingPolicy(organizationId),
  ]);

  const defaultPolicy: AutopilotPolicySettings = basePolicy ?? {
    feePercent: 12,
    additionalCostPercent: 0,
    minimumMarginPercent: 20,
    desiredMarginPercent: 25,
    marketDiscountPercent: 3,
  };

  const { safe, flagged, unchanged, potentialRevenueImpact, marginSum } = evaluateAutopilotItemChunk(
    inventory.items,
    rules,
    defaultPolicy,
    channel
  );

  const totalItems = inventory.items.length;
  const averageProjectedMargin = totalItems > 0 ? Number((marginSum / totalItems).toFixed(1)) : 0;

  return {
    channel,
    safe,
    flagged,
    unchanged,
    stats: {
      totalItems,
      safeCount: safe.length,
      flaggedCount: flagged.length,
      unchangedCount: unchanged.length,
      potentialRevenueImpact: Number(potentialRevenueImpact.toFixed(2)),
      averageProjectedMargin,
    },
  };
}

export async function applyPriceBatch(
  organizationId: string,
  userId: string | null,
  input: z.infer<typeof applyBatchInputSchema> & {
    source?: "manual_bulk_approve" | "single_approve" | "autopilot_auto";
    idempotencyKey?: string;
    workerFence?: { workerId: string; version: number };
  }
) {
  if (input.channel !== "counter") {
    return {
      success: false,
      message: "Este canal está disponível para simulação. A aplicação exige um preço por canal e um integrador configurado.",
      batch: null,
    };
  }

  const queue = await getAutopilotQueue(organizationId, input.channel);

  let targetItems: AutopilotItemView[] = [];

  if (input.applyAllSafe) {
    targetItems = queue.safe;
  } else if (input.itemIds && input.itemIds.length > 0) {
    const idSet = new Set(input.itemIds);
    const combined = [...queue.safe, ...queue.flagged];
    targetItems = combined.filter((item) => idSet.has(item.id) && Math.abs(item.priceDifference) >= 0.01);
  }

  if (targetItems.length === 0) {
    return {
      success: false,
      message: "Nenhum produto qualificado ou selecionado para atualização.",
      batch: null,
    };
  }

  return db.transaction(async (tx) => {
    if (input.workerFence) {
      const fence = await tx.execute(sql`select id from autopilot_worker_state
        where id = 1 and worker_id = ${input.workerFence.workerId}::uuid
          and fencing_version = ${input.workerFence.version}
          and lease_expires_at > now() for update`);
      if (fence.length !== 1) throw new AutopilotConflictError("Lease do worker perdido; alteração bloqueada.");
    }
    if (input.idempotencyKey) {
      const [existing] = await tx.select().from(priceChangeBatches).where(and(
        eq(priceChangeBatches.organizationId, organizationId),
        eq(priceChangeBatches.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (existing) return { success: true, message: "Lote já aplicado anteriormente.", batch: existing };
    }
    let totalBefore = new Decimal(0);
    let totalAfter = new Decimal(0);

    for (const item of targetItems) {
      totalBefore = totalBefore.plus(new Decimal(item.currentPrice).mul(item.stock));
      totalAfter = totalAfter.plus(new Decimal(item.suggestedPrice).mul(item.stock));
    }

    const [batch] = await tx
      .insert(priceChangeBatches)
      .values({
        organizationId,
        idempotencyKey: input.idempotencyKey ?? null,
        createdById: userId,
        source: input.source ?? "manual_bulk_approve",
        channel: input.channel,
        status: "applied",
        totalItems: targetItems.length,
        totalValueBefore: totalBefore.toFixed(2),
        totalValueAfter: totalAfter.toFixed(2),
        notes: input.notes ?? `Atualização de ${targetItems.length} itens no canal ${input.channel}`,
      })
      .returning();

    const logRows = targetItems.map((item) => ({
      organizationId,
      batchId: batch.id,
      inventoryItemId: item.id,
      previousPrice: item.currentPrice.toFixed(2),
      newPrice: item.suggestedPrice.toFixed(2),
      suggestedPrice: item.suggestedPrice.toFixed(2),
      minimumPrice: item.minimumPrice.toFixed(2),
      marginPercent: item.projectedMargin.toFixed(4),
      safetyStatus: item.safetyStatus,
    }));
    await tx.insert(priceChangeHistory).values(logRows);

    const valueTuples = targetItems.map(
      (item) => sql`(${item.id}::uuid, ${item.suggestedPrice.toFixed(2)}::numeric, ${item.currentPrice.toFixed(2)}::numeric, ${item.cost.toFixed(2)}::numeric)`
    );

    const updatedRows = await tx.execute(sql`
      UPDATE inventory_items AS i
      SET price = v.new_price,
          updated_at = NOW()
      FROM (VALUES ${sql.join(valueTuples, sql`, `)}) AS v(id, new_price, expected_price, expected_cost)
      WHERE i.id = v.id
        AND i.organization_id = ${organizationId}::uuid
        AND i.price = v.expected_price
        AND i.cost = v.expected_cost
      RETURNING i.id;
    `);

    if (updatedRows.length !== targetItems.length) {
      throw new AutopilotConflictError(
        "Aplicação interrompida: ao menos um preço ou custo mudou durante a aprovação. Nenhum item foi alterado."
      );
    }

    // Gerar alerta auditável na central de alertas
    await tx.insert(alerts).values({
      organizationId,
      severity: "info",
      title: `Lote de preços aplicado (${batch.totalItems} itens)`,
      message: `Canal ${batch.channel.toUpperCase()}: valor de estoque ajustado de R$ ${totalBefore.toFixed(2)} para R$ ${totalAfter.toFixed(2)}.`,
    });

    return {
      success: true,
      message: `${targetItems.length} preços atualizados com sucesso.`,
      batch,
    };
  });
}

export async function rollbackPriceBatch(
  organizationId: string,
  userId: string,
  batchId: string
) {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(priceChangeBatches)
      .where(
        and(
          eq(priceChangeBatches.id, batchId),
          eq(priceChangeBatches.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!batch) {
      throw new AutopilotNotFoundError("Lote não encontrado.");
    }

    if (batch.status === "reverted") {
      throw new AutopilotConflictError("Este lote já foi revertido anteriormente.");
    }

    const logs = await tx
      .select()
      .from(priceChangeHistory)
      .where(
        and(eq(priceChangeHistory.batchId, batchId), eq(priceChangeHistory.organizationId, organizationId))
      );

    if (logs.length > 0) {
      const valueTuples = logs.map(
        (log) => sql`(${log.inventoryItemId}::uuid, ${log.previousPrice}::numeric, ${log.newPrice}::numeric)`
      );

      const restoredRows = await tx.execute(sql`
        UPDATE inventory_items AS i
        SET price = v.restored_price,
            updated_at = NOW()
        FROM (VALUES ${sql.join(valueTuples, sql`, `)}) AS v(id, restored_price, expected_current_price)
        WHERE i.id = v.id
          AND i.organization_id = ${organizationId}::uuid
          AND i.price = v.expected_current_price
        RETURNING i.id;
      `);

      if (restoredRows.length !== logs.length) {
        throw new AutopilotConflictError(
          "Rollback interrompido: ao menos um preço já foi alterado depois deste lote. Nenhum item foi revertido."
        );
      }
    }

    const [updatedBatch] = await tx
      .update(priceChangeBatches)
      .set({
        status: "reverted",
        revertedAt: new Date(),
        revertedById: userId,
      })
      .where(
        and(
          eq(priceChangeBatches.id, batchId),
          eq(priceChangeBatches.organizationId, organizationId),
          eq(priceChangeBatches.status, "applied"),
        )
      )
      .returning();
    if (!updatedBatch) {
      throw new AutopilotConflictError("Este lote não pode mais ser revertido.");
    }

    await tx.insert(alerts).values({
      organizationId,
      severity: "warning",
      title: "Lote de preços desfeito (Rollback)",
      message: `O lote de ${logs.length} itens do canal ${batch.channel.toUpperCase()} foi revertido para os preços anteriores.`,
    });

    return {
      success: true,
      message: `Rollback concluído: ${logs.length} itens restaurados aos valores originais.`,
      batch: updatedBatch,
    };
  });
}

export async function listPriceBatches(organizationId: string, limit = 20) {
  const rows = await db
    .select({
      id: priceChangeBatches.id,
      source: priceChangeBatches.source,
      channel: priceChangeBatches.channel,
      status: priceChangeBatches.status,
      totalItems: priceChangeBatches.totalItems,
      totalValueBefore: priceChangeBatches.totalValueBefore,
      totalValueAfter: priceChangeBatches.totalValueAfter,
      revertedAt: priceChangeBatches.revertedAt,
      notes: priceChangeBatches.notes,
      createdAt: priceChangeBatches.createdAt,
      createdByName: users.name,
    })
    .from(priceChangeBatches)
    .leftJoin(users, eq(users.id, priceChangeBatches.createdById))
    .where(eq(priceChangeBatches.organizationId, organizationId))
    .orderBy(desc(priceChangeBatches.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    totalValueBefore: Number(row.totalValueBefore),
    totalValueAfter: Number(row.totalValueAfter),
  }));
}

export async function runAutopilotAutomation(organizationId: string) {
  const channels: Array<"counter"> = ["counter"];
  const results = [];
  const rules = await listPricingRules(organizationId);

  for (const channel of channels) {
    const queue = await getAutopilotQueue(organizationId, channel);
    // Verificar quais itens seguros pertencem a regras com autoApplySafe === true
    const eligibleItemIds = queue.safe
      .filter((item) => {
        return isRuleEligibleForAutoApply(item.ruleId, rules);
      })
      .map((item) => item.id);

    if (eligibleItemIds.length > 0) {
      const applied = await applyPriceBatch(organizationId, null, {
        channel,
        itemIds: eligibleItemIds,
        applyAllSafe: false,
        source: "autopilot_auto",
        notes: `Autopilot executado automaticamente: ${eligibleItemIds.length} itens seguros`,
      });
      results.push({ channel, applied });
    }
  }

  return results;
}
