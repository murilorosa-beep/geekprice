import "server-only";

import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { databaseTlsOptions } from "@/db/connection-settings";
import { alerts, organizations } from "@/db/schema";
import {
  applyPriceBatch,
  getAutopilotQueue,
  isRuleEligibleForAutoApply,
  listPricingRules,
} from "./service";

export type WorkerExecutionResult = {
  timestamp: string;
  organizationsProcessed: number;
  totalEvaluated: number;
  safeCount: number;
  suspiciousCount: number;
  appliedCount: number;
  batchesCreated: number;
  details: Array<{
    organizationId: string;
    organizationName: string;
    channel: string;
    safe: number;
    suspicious: number;
    autoApplied: boolean;
  }>;
};

export class AutopilotBusyError extends Error {}

let workerInProgress = false;

export async function runAutopilotReevaluationCycle(options?: {
  specificOrgId?: string;
}): Promise<WorkerExecutionResult> {
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

/**
 * Executa um ciclo completo de reavaliação de preços em segundo plano para todas as lojas.
 * Avalia regras, classifica risco (safe_auto vs suspicious_flagged), persiste dados,
 * auto-aplica regras autorizadas e emite alertas auditáveis.
 */
async function runUnlockedCycle(options?: {
  specificOrgId?: string;
}): Promise<WorkerExecutionResult> {
  const orgFilter = options?.specificOrgId
    ? eq(organizations.id, options.specificOrgId)
    : undefined;

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(orgFilter);

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
  const details: WorkerExecutionResult["details"] = [];

  for (const org of orgs) {
    const rules = await listPricingRules(org.id);

    for (const channel of channels) {
      const queue = await getAutopilotQueue(org.id, channel);
      totalEvaluated += queue.stats.totalItems;
      totalSafe += queue.safe.length;
      totalSuspicious += queue.flagged.length;

      // 1. Alertar sobre oscilações suspeitas (flagged_spike ou margem em risco)
      const criticalSpikes = queue.flagged.filter(
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

      // E-commerce e marketplace permanecem em simulação até existir preço por canal.
      let autoApplied = false;
      const eligibleItems = channel === "counter" ? queue.safe.filter((item) => {
        return isRuleEligibleForAutoApply(item.ruleId, rules);
      }) : [];

      if (eligibleItems.length > 0) {
        const applyRes = await applyPriceBatch(org.id, null, {
          channel,
          itemIds: eligibleItems.map((i) => i.id),
          applyAllSafe: false,
          source: "autopilot_auto",
          notes: `Autopilot Worker Recorrente: ${eligibleItems.length} alterações seguras aplicadas`,
        });

        if (applyRes.success && applyRes.batch) {
          autoApplied = true;
          totalApplied += eligibleItems.length;
          batchesCreated += 1;
        }
      }

      details.push({
        organizationId: org.id,
        organizationName: org.name,
        channel,
        safe: queue.safe.length,
        suspicious: queue.flagged.length,
        autoApplied,
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    organizationsProcessed: orgs.length,
    totalEvaluated,
    safeCount: totalSafe,
    suspiciousCount: totalSuspicious,
    appliedCount: totalApplied,
    batchesCreated,
    details,
  };
}
