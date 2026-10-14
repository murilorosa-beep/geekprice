import "server-only";

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { databaseTlsOptions } from "@/db/connection-settings";
import { alerts, organizations } from "@/db/schema";
import { listInventoryChunk } from "@/server/inventory/service";
import { getActivePricingPolicy } from "@/server/settings/service";
import {
  applyPriceBatch,
  evaluateAutopilotItemChunk,
  isRuleEligibleForAutoApply,
  listPricingRules,
  type AutopilotPolicySettings,
} from "./service";

export type WorkerCheckpoint = {
  lastOrgId: string | null;
  lastItemOffset: number;
  updatedAt: string;
  completed: boolean;
};

export type WorkerExecutionResult = {
  timestamp: string;
  organizationsProcessed: number;
  totalEvaluated: number;
  safeCount: number;
  suspiciousCount: number;
  appliedCount: number;
  batchesCreated: number;
  interruptedByBudget: boolean;
  durationMs: number;
  memoryUsage: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  details: Array<{
    organizationId: string;
    organizationName: string;
    channel: string;
    safe: number;
    suspicious: number;
    autoApplied: boolean;
  }>;
  checkpoint?: WorkerCheckpoint | null;
};

export type WorkerCycleOptions = {
  specificOrgId?: string;
  maxOrganizationsPerCycle?: number;
  maxItemsPerOrganization?: number;
  maxTotalItemsPerCycle?: number;
  maxExecutionTimeMs?: number;
  chunkSize?: number;
  resumeFromCheckpoint?: boolean;
  checkpointStorePath?: string;
};

export class AutopilotBusyError extends Error {}

let workerInProgress = false;

const DEFAULT_CHECKPOINT_FILE = path.resolve(".tools/autopilot-worker-checkpoint.json");

export function loadWorkerCheckpoint(customPath?: string): WorkerCheckpoint | null {
  const filePath = customPath || DEFAULT_CHECKPOINT_FILE;
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const data = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf8"));
      return data as WorkerCheckpoint;
    }
  } catch {
    // Retorna null se não houver ou estiver corrompido
  }
  return null;
}

export function saveWorkerCheckpoint(checkpoint: WorkerCheckpoint, customPath?: string): void {
  const filePath = customPath || DEFAULT_CHECKPOINT_FILE;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(/*turbopackIgnore: true*/ tempPath, JSON.stringify(checkpoint, null, 2), "utf8");
    fs.renameSync(/*turbopackIgnore: true*/ tempPath, filePath);
  } catch (err) {
    console.error("[Autopilot Worker] Falha ao persistir checkpoint:", err);
  }
}

export function clearWorkerCheckpoint(customPath?: string): void {
  const filePath = customPath || DEFAULT_CHECKPOINT_FILE;
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      fs.unlinkSync(/*turbopackIgnore: true*/ filePath);
    }
  } catch {
    // Silencioso
  }
}

export async function runAutopilotReevaluationCycle(
  options?: WorkerCycleOptions
): Promise<WorkerExecutionResult> {
  if (workerInProgress) throw new AutopilotBusyError("Já existe um ciclo do Autopilot em execução.");
  workerInProgress = true;
  const lockUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  try {
    if (!lockUrl || new URL(lockUrl).port === "6543") {
      throw new Error("O worker exige uma conexão PostgreSQL de sessão para seu bloqueio distribuído.");
    }
    const lockClient = postgres(lockUrl, { ...databaseTlsOptions(), prepare: false, max: 1, connect_timeout: 10 });
    try {
      const reserved = await lockClient.reserve();
      try {
        const [lock] = await reserved`select pg_try_advisory_lock(hashtextextended('geekprice:autopilot-worker', 0)) as acquired`;
        if (!lock.acquired) throw new AutopilotBusyError("Já existe um ciclo do Autopilot em execução.");
        try {
          return await runUnlockedCycle(options);
        } finally {
          await reserved`select pg_advisory_unlock(hashtextextended('geekprice:autopilot-worker', 0))`;
        }
      } finally {
        reserved.release();
      }
    } finally {
      await lockClient.end();
    }
  } finally {
    workerInProgress = false;
  }
}

async function runUnlockedCycle(options?: WorkerCycleOptions): Promise<WorkerExecutionResult> {
  const startTime = Date.now();
  const maxExecutionTimeMs = options?.maxExecutionTimeMs ?? 45_000;
  const maxOrganizations = options?.maxOrganizationsPerCycle ?? 50;
  const maxItemsPerOrg = options?.maxItemsPerOrganization ?? 1_000;
  const maxTotalItems = options?.maxTotalItemsPerCycle ?? 5_000;
  const chunkSize = options?.chunkSize ?? 100;
  const checkpointPath = options?.checkpointStorePath;

  const previousCheckpoint = options?.resumeFromCheckpoint !== false ? loadWorkerCheckpoint(checkpointPath) : null;

  const orgFilter = options?.specificOrgId
    ? eq(organizations.id, options.specificOrgId)
    : undefined;

  let orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(orgFilter)
    .orderBy(asc(organizations.id));

  // Retomada a partir do checkpoint se existente
  let resumeOffset = 0;
  if (previousCheckpoint && !previousCheckpoint.completed && previousCheckpoint.lastOrgId) {
    const resumeIdx = orgs.findIndex((o) => o.id === previousCheckpoint.lastOrgId);
    if (resumeIdx !== -1) {
      orgs = orgs.slice(resumeIdx);
      resumeOffset = previousCheckpoint.lastItemOffset;
    }
  }

  // Limite de organizações por ciclo
  if (orgs.length > maxOrganizations) {
    orgs = orgs.slice(0, maxOrganizations);
  }

  const channels: Array<"counter" | "ecommerce" | "marketplace"> = [
    "counter",
    "ecommerce",
    "marketplace",
  ];

  let totalEvaluated = 0;
  let totalSafe = 0;
  let totalSuspicious = 0;
  let totalApplied = 0;
  let batchesCreated = 0;
  let interruptedByBudget = false;
  let currentCheckpoint: WorkerCheckpoint | null = null;
  const details: WorkerExecutionResult["details"] = [];

  for (let oIdx = 0; oIdx < orgs.length; oIdx++) {
    const org = orgs[oIdx];
    const isResumedOrg = oIdx === 0 && resumeOffset > 0;
    let orgItemsEvaluated = 0;

    const [rules, basePolicy] = await Promise.all([
      listPricingRules(org.id),
      getActivePricingPolicy(org.id),
    ]);

    const defaultPolicy: AutopilotPolicySettings = basePolicy ?? {
      feePercent: 12,
      additionalCostPercent: 0,
      minimumMarginPercent: 20,
      desiredMarginPercent: 25,
      marketDiscountPercent: 3,
    };

    for (const channel of channels) {
      let offset = isResumedOrg ? resumeOffset : 0;
      let channelSafeCount = 0;
      let channelSuspiciousCount = 0;
      let channelAutoApplied = false;

      while (true) {
        // Verificar orçamento de tempo
        if (Date.now() - startTime >= maxExecutionTimeMs) {
          interruptedByBudget = true;
          currentCheckpoint = {
            lastOrgId: org.id,
            lastItemOffset: offset,
            updatedAt: new Date().toISOString(),
            completed: false,
          };
          saveWorkerCheckpoint(currentCheckpoint, checkpointPath);
          break;
        }

        // Verificar limite por organização e global por ciclo
        if (orgItemsEvaluated >= maxItemsPerOrg || totalEvaluated >= maxTotalItems) {
          break;
        }

        const currentLimit = Math.min(
          chunkSize,
          maxItemsPerOrg - orgItemsEvaluated,
          maxTotalItems - totalEvaluated
        );

        const chunk = await listInventoryChunk(org.id, {
          limit: currentLimit,
          offset,
        });

        if (chunk.length === 0) {
          break; // Fim do inventário da organização
        }

        const chunkResult = evaluateAutopilotItemChunk(chunk, rules, defaultPolicy, channel);

        totalEvaluated += chunk.length;
        orgItemsEvaluated += chunk.length;
        offset += chunk.length;

        totalSafe += chunkResult.safe.length;
        totalSuspicious += chunkResult.flagged.length;
        channelSafeCount += chunkResult.safe.length;
        channelSuspiciousCount += chunkResult.flagged.length;

        // 1. Alertas sobre oscilações suspeitas
        const criticalSpikes = chunkResult.flagged.filter(
          (item) => item.safetyGate === "spike_threshold_exceeded"
        );
        if (criticalSpikes.length > 0) {
          const topSpike = criticalSpikes[0];
          const dedupeKey = `spike:${org.id}:${topSpike.id}:${new Date().toISOString().slice(0, 10)}`;
          await db
            .insert(alerts)
            .values({
              organizationId: org.id,
              severity: "warning",
              title: `Trava de oscilação ativada (${criticalSpikes.length} cartas)`,
              message: `Salto expressivo detectado em "${topSpike.name}" (${topSpike.percentageChange >= 0 ? "+" : ""}${topSpike.percentageChange.toFixed(1)}%). Preço retido para aprovação manual.`,
              dedupeKey,
            })
            .onConflictDoNothing();
        }

        // 2. Auto-aplicação apenas no canal balcão (counter) com regra elegível
        const eligibleItems = channel === "counter"
          ? chunkResult.safe.filter((item) => isRuleEligibleForAutoApply(item.ruleId, rules))
          : [];

        if (eligibleItems.length > 0) {
          const applyRes = await applyPriceBatch(org.id, null, {
            channel,
            itemIds: eligibleItems.map((i) => i.id),
            applyAllSafe: false,
            source: "autopilot_auto",
            notes: `Autopilot Worker Recorrente: ${eligibleItems.length} alterações seguras aplicadas`,
          });

          if (applyRes.success && applyRes.batch) {
            channelAutoApplied = true;
            totalApplied += eligibleItems.length;
            batchesCreated += 1;
          }
        }
      }

      details.push({
        organizationId: org.id,
        organizationName: org.name,
        channel,
        safe: channelSafeCount,
        suspicious: channelSuspiciousCount,
        autoApplied: channelAutoApplied,
      });

      if (interruptedByBudget) break;
    }

    if (interruptedByBudget) break;
  }

  // Se completou todas as organizações sem interrupção de orçamento, limpa checkpoint
  if (!interruptedByBudget) {
    currentCheckpoint = {
      lastOrgId: null,
      lastItemOffset: 0,
      updatedAt: new Date().toISOString(),
      completed: true,
    };
    clearWorkerCheckpoint(checkpointPath);
  }

  const durationMs = Date.now() - startTime;
  const mem = process.memoryUsage();
  const memoryUsage = {
    heapUsedMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
    heapTotalMB: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
    rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
  };

  const result: WorkerExecutionResult = {
    timestamp: new Date().toISOString(),
    organizationsProcessed: orgs.length,
    totalEvaluated,
    safeCount: totalSafe,
    suspiciousCount: totalSuspicious,
    appliedCount: totalApplied,
    batchesCreated,
    interruptedByBudget,
    durationMs,
    memoryUsage,
    details,
    checkpoint: currentCheckpoint,
  };

  // Log estruturado JSON
  console.log(
    JSON.stringify({
      level: "info",
      event: "autopilot_worker_cycle_finished",
      durationMs,
      organizationsProcessed: result.organizationsProcessed,
      totalEvaluated,
      safeCount: totalSafe,
      suspiciousCount: totalSuspicious,
      appliedCount: totalApplied,
      batchesCreated,
      interruptedByBudget,
      memoryUsage,
    })
  );

  return result;
}
