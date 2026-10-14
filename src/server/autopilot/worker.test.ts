import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  clearWorkerCheckpoint,
  loadWorkerCheckpoint,
  saveWorkerCheckpoint,
  type WorkerCheckpoint,
} from "./worker";
import { evaluateAutopilotItemChunk, type AutopilotPolicySettings, type PricingRuleRecord } from "./service";

const testCheckpointFile = path.resolve(".tools/test-autopilot-checkpoint.json");

describe("Worker Autopilot Escalável — Checkpoints e Avaliação Paginada", () => {
  beforeEach(() => {
    if (fs.existsSync(testCheckpointFile)) fs.unlinkSync(testCheckpointFile);
  });

  afterEach(() => {
    if (fs.existsSync(testCheckpointFile)) fs.unlinkSync(testCheckpointFile);
  });

  it("salva, carrega e limpa checkpoints de forma atômica", () => {
    const cp: WorkerCheckpoint = {
      lastOrgId: "org-1234",
      lastItemOffset: 250,
      updatedAt: new Date().toISOString(),
      completed: false,
    };

    saveWorkerCheckpoint(cp, testCheckpointFile);
    const loaded = loadWorkerCheckpoint(testCheckpointFile);
    expect(loaded).not.toBeNull();
    expect(loaded?.lastOrgId).toBe("org-1234");
    expect(loaded?.lastItemOffset).toBe(250);
    expect(loaded?.completed).toBe(false);

    clearWorkerCheckpoint(testCheckpointFile);
    expect(loadWorkerCheckpoint(testCheckpointFile)).toBeNull();
  });

  it("avalia chunks de itens sem estourar memória nem misturar regras", () => {
    const items = [
      {
        id: "item-1",
        name: "Pikachu Illustrator",
        category: "Pokemon",
        sku: "PIKA-001",
        cost: 100,
        currentPrice: 150,
        marketPrice: 200,
        desiredMarginPercent: 25,
        stock: 5,
      },
      {
        id: "item-2",
        name: "Black Lotus",
        category: "Magic",
        sku: "LOTUS-001",
        cost: 500,
        currentPrice: 800,
        marketPrice: 900,
        desiredMarginPercent: 30,
        stock: 1,
      },
    ];

    const rules: PricingRuleRecord[] = [];
    const defaultPolicy: AutopilotPolicySettings = {
      feePercent: 10,
      additionalCostPercent: 5,
      minimumMarginPercent: 20,
      desiredMarginPercent: 25,
      marketDiscountPercent: 0,
    };

    const chunkResult = evaluateAutopilotItemChunk(items, rules, defaultPolicy, "counter");
    expect(chunkResult.safe.length + chunkResult.flagged.length + chunkResult.unchanged.length).toBe(2);
    expect(chunkResult.marginSum).toBeGreaterThan(0);
    expect(chunkResult.potentialRevenueImpact).toBeDefined();

    // Cada item calculado respeita o piso rentável: cost / (1 - fees - additional - minMargin)
    // 100 / (1 - 0.10 - 0.05 - 0.20) = 100 / 0.65 = 153.85
    const pika = chunkResult.safe.find((i) => i.id === "item-1") || chunkResult.flagged.find((i) => i.id === "item-1") || chunkResult.unchanged.find((i) => i.id === "item-1");
    expect(pika?.minimumPrice).toBeGreaterThanOrEqual(153.84);
  });
});
