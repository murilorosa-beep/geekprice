import { beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { safeWooGet } from "@/server/commerce/safe-request";

vi.mock("@/server/commerce/safe-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/commerce/safe-request")>();
  return { ...actual, safeWooGet: vi.fn() };
});
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  externalProductMappings,
  integrationConnections,
  inventoryItems,
  autopilotWorkerState,
  priceChangeBatches,
  memberships,
  organizations,
  priceChangeHistory,
  syncRuns,
  users,
} from "@/db/schema";
import {
  commitCommerceImport,
  createWooCommerceConnection,
  deleteOrganizationConnection,
  generateCommerceImportPreview,
  listOrganizationConnections,
} from "@/server/commerce/service";
import { reconcileCommerceProducts } from "@/server/commerce/reconciliation";
import type { CommerceProduct } from "@/server/commerce/types";
import {
  clearWorkerCheckpoint,
  runAutopilotReevaluationCycle,
} from "@/server/autopilot/worker";
import { hashPassword } from "@/server/auth/password";
import { createInventoryItem, listAllInventory } from "@/server/inventory/service";
import { inventoryInputSchema } from "@/server/inventory/schemas";
import { applyPriceBatch, createPricingRule } from "@/server/autopilot/service";
import { createPricingRuleSchema } from "@/server/autopilot/schemas";
import { importBrlMarketReferences } from "@/server/market/partner-import";
import { brlMarketRowSchema } from "@/server/market/partner-csv";

const run = Date.now().toString();
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;

beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  const name = process.env.PHASE81_TEST_DATABASE;
  if (!name || !/^geekprice_phase81_test_\d+$/.test(name) || target.pathname !== `/${name}`) {
    throw new Error("Integration tests require the explicitly isolated Supabase database");
  }

  const [a, b] = await db
    .insert(organizations)
    .values([
      { name: "TESTE_FASE9 Loja A", slug: `fase9-a-${run}`, onboardingCompletedAt: new Date() },
      { name: "TESTE_FASE9 Loja B", slug: `fase9-b-${run}`, onboardingCompletedAt: new Date() },
    ])
    .returning();
  orgA = a.id;
  orgB = b.id;

  const passwordHash = await hashPassword("StrongTestPass123!@#");
  const [ownerA, ownerB] = await db
    .insert(users)
    .values([
      { name: "Owner A Fase 9", email: `owner-a-${run}@phase9.invalid`, passwordHash, emailVerifiedAt: new Date() },
      { name: "Owner B Fase 9", email: `owner-b-${run}@phase9.invalid`, passwordHash, emailVerifiedAt: new Date() },
    ])
    .returning();
  userA = ownerA.id;
  userB = ownerB.id;

  await db.insert(memberships).values([
    { organizationId: orgA, userId: userA, role: "owner" },
    { organizationId: orgB, userId: userB, role: "owner" },
  ]);
});

describe("Fase 9 — Testes de Integração com PostgreSQL Real Isolado", () => {
  let connectionAId: string;

  it("cria e isola conexões comerciais com criptografia no PostgreSQL", async () => {
    // 1. Criar conexão para Loja A
    const { connection } = await createWooCommerceConnection(orgA, {
      name: "WooCommerce Piloto Loja A",
      storeUrl: "https://minhaloja-teste.com.br",
      consumerKey: "ck_live_abcdef123456",
      consumerSecret: "cs_live_fedcba654321",
    });
    connectionAId = connection.id;
    expect(connectionAId).toBeDefined();

    // 2. Loja A visualiza sua conexão
    const listA = await listOrganizationConnections(orgA);
    expect(listA.map((c) => c.id)).toContain(connectionAId);

    // 3. Loja B NÃO visualiza a conexão da Loja A (isolamento multiempresa)
    const listB = await listOrganizationConnections(orgB);
    expect(listB.map((c) => c.id)).not.toContain(connectionAId);

    // 4. Credencial persistida no PostgreSQL está criptografada
    const [row] = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, connectionAId));
    expect(row.encryptedCredentials.startsWith("v1.")).toBe(true);
    expect(row.encryptedCredentials).not.toContain("ck_live_abcdef");
  });

  it("concilia produtos e impede colisão de mesmo SKU entre lojas distintas", async () => {
    const commonSku = `SHARED-SKU-${run}`;

    // Loja A cadastra um produto com o SKU
    const itemA = await createInventoryItem(
      orgA,
      inventoryInputSchema.parse({
        name: "Produto da Loja A",
        category: "Pokemon",
        sku: commonSku,
        cost: 50,
        price: 90,
        quantity: 5,
        desiredMarginPercent: 25,
      })
    );

    // Loja B cadastra um produto com o MESMO SKU mas nome e dados diferentes
    const itemB = await createInventoryItem(
      orgB,
      inventoryInputSchema.parse({
        name: "Produto da Loja B",
        category: "Magic",
        sku: commonSku,
        cost: 200,
        price: 350,
        quantity: 1,
        desiredMarginPercent: 30,
      })
    );

    expect(itemA.id).not.toBe(itemB.id);
    expect(itemA.variantId).not.toBe(itemB.variantId);

    // Reconciliação na Loja A: o SKU corresponde exatamente ao produto da Loja A
    const reconciliationA = await reconcileCommerceProducts(orgA, connectionAId, [
      {
        externalId: "ext-100",
        name: "Produto da Loja A",
        sku: commonSku,
        barcode: null,
        category: "Pokemon",
        price: "95.00",
        cost: null,
        quantity: 10,
        updatedAt: new Date(),
      },
    ]);

    expect(reconciliationA[0].status).toBe("exact_match");
    expect(reconciliationA[0].matchedInventoryItemId).toBe(itemA.id);

    // Reconciliação na Loja B não mistura com os dados da Loja A
    const reconciliationB = await reconcileCommerceProducts(orgB, connectionAId, [
      {
        externalId: "ext-100",
        name: "Produto da Loja B",
        sku: commonSku,
        barcode: null,
        category: "Magic",
        price: "360.00",
        cost: null,
        quantity: 2,
        updatedAt: new Date(),
      },
    ]);

    expect(reconciliationB[0].status).toBe("exact_match");
    expect(reconciliationB[0].matchedInventoryItemId).toBe(itemB.id);
  });

  it("importa produtos conciliados, atualiza estoque e mantém idempotência", async () => {
    const uniqueSku = `IMPORT-TEST-${run}`;
    const externalProducts: CommerceProduct[] = [
      {
        externalId: `wc-${run}-1`,
        name: "Cartão Especial Importado",
        sku: uniqueSku,
        barcode: "7890001112223",
        category: "Colecionáveis",
        price: "150.00",
        cost: "80.00",
        quantity: 7,
        setName: "Coleção Alfa",
        collectorNumber: "001",
        updatedAt: new Date(),
      },
    ];

    // Reconciliar e simular preview
    const reconciled = await reconcileCommerceProducts(orgA, connectionAId, externalProducts);
    expect(reconciled[0].status).toBe("new_product");

    // Mock fetch para responder aos produtos WooCommerce sem depender de DNS externo
    vi.mocked(safeWooGet).mockImplementation(async (input) => {
      const urlStr = String(input);
      if (urlStr.includes("wp-json/wc/v3/products")) {
        return new Response(
          JSON.stringify(
            externalProducts.map((p) => ({
              id: 999,
              name: p.name,
              sku: p.sku,
              price: p.price,
              regular_price: p.price,
              manage_stock: true,
              stock_quantity: p.quantity,
              categories: [{ name: p.category }],
              attributes: [],
              meta_data: [{ key: "barcode", value: p.barcode }],
            }))
          ),
          {
            status: 200,
            headers: { "x-wp-total": "1", "x-wp-totalpages": "1" },
          }
        );
      }
      return new Response("{}", { status: 404 });
    });

    const preview = await generateCommerceImportPreview(orgA, connectionAId);

    // Commit da importação
    const commitResult = await commitCommerceImport(orgA, userA, {
      connectionId: connectionAId,
      previewToken: preview.previewToken,
    });

    expect(commitResult.syncRunId).toBeDefined();

    // Conferir que o produto existe no estoque da Loja A
    const invA = await listAllInventory(orgA);
    const importedItem = invA.items.find((i) => i.sku === uniqueSku || i.sku?.includes(uniqueSku));
    expect(importedItem).toBeDefined();

    // Mapeamento externo foi gravado no PostgreSQL
    const mappings = await db
      .select()
      .from(externalProductMappings)
      .where(
        eq(externalProductMappings.connectionId, connectionAId)
      );
    expect(mappings.length).toBeGreaterThan(0);

    // Sync run gravado com status completed ou partial
    const [runRow] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, commitResult.syncRunId));
    expect(runRow.status).toBe("completed");
    expect(runRow.completedAt).not.toBeNull();
  });

  it("consome um preview uma única vez sob dois commits simultâneos", async () => {
    const preview = await generateCommerceImportPreview(orgA, connectionAId);
    const attempts = await Promise.allSettled([
      commitCommerceImport(orgA, userA, { connectionId: connectionAId, previewToken: preview.previewToken }),
      commitCommerceImport(orgA, userA, { connectionId: connectionAId, previewToken: preview.previewToken }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const runRows = await db.select().from(syncRuns).where(eq(syncRuns.connectionId, connectionAId));
    expect(runRows.filter((row) => row.status === "completed")).toHaveLength(2);
  });

  it("rejeita confirmação quando preço local muda após o preview", async () => {
    const preview = await generateCommerceImportPreview(orgA, connectionAId);
    const id = preview.items[0].matchedInventoryItemId;
    expect(id).toBeTruthy();
    await db.update(inventoryItems).set({ price: "199.00" }).where(eq(inventoryItems.id, id!));
    await expect(commitCommerceImport(orgA, userA, {
      connectionId: connectionAId, previewToken: preview.previewToken,
    })).rejects.toThrow("Inventário alterado");
  });

  it("rejeita confirmação quando a origem WooCommerce muda após o preview", async () => {
    const preview = await generateCommerceImportPreview(orgA, connectionAId);
    vi.mocked(safeWooGet).mockResolvedValueOnce(new Response(JSON.stringify([{
      id: 999, name: "Produto alterado na origem", sku: "ALTERADO", price: "500.00",
      manage_stock: true, stock_quantity: 1,
    }]), { status: 200, headers: { "x-wp-totalpages": "1" } }));
    await expect(commitCommerceImport(orgA, userA, {
      connectionId: connectionAId, previewToken: preview.previewToken,
    })).rejects.toThrow("Catálogo WooCommerce alterado");
  });

  it("executa o worker Autopilot paginado com checkpoint e retomada", async () => {
    // 1. Cadastrar 10 itens sintéticos para teste de chunks do worker
    for (let i = 0; i < 6; i++) {
      const sku = `WORKER-CHUNK-${run}-${i}`;
      await createInventoryItem(
        orgA,
        inventoryInputSchema.parse({
          name: `Item Worker Paginado ${i}`,
          category: "TESTE_SINTETICO",
          sku,
          cost: 60,
          price: 110,
          quantity: 2,
          desiredMarginPercent: 25,
          setName: "SYNTHETIC_WORKER",
          collectorNumber: `00${i}`,
          language: "pt-BR",
          condition: "NM",
          finish: "standard",
        })
      );

      // Injetar cotação BRL recente de referência privada
      await importBrlMarketReferences(orgA, [
        brlMarketRowSchema.parse({
          productName: `Item Worker Paginado ${i}`,
          setName: "SYNTHETIC_WORKER",
          collectorNumber: `00${i}`,
          language: "pt-BR",
          condition: "NM",
          finish: "standard",
          sourceName: "TESTE_SINTETICO PRIVATE WORKER",
          priceType: "reference",
          currency: "BRL",
          price: 130 + i,
          referenceAt: new Date(),
        }),
      ]);
    }

    // Criar regra com autoApplySafe ativado
    await createPricingRule(
      orgA,
      createPricingRuleSchema.parse({
        name: `Regra Worker ${run}`,
        channel: "counter",
        category: "TESTE_SINTETICO",
        feePercent: 10,
        additionalCostPercent: 5,
        minimumMarginPercent: 20,
        desiredMarginPercent: 25,
        marketDiscountPercent: 0,
        maxChangePercent: 35,
        roundingMode: "none",
        autoApplySafe: true,
      })
    );

    // Executar ciclo do worker com limite de itens por chunk (chunkSize: 2, maxItemsPerOrganization: 4)
    // Isso forçará parada parcial e gravação de checkpoint
    const testCpPath = `.tools/test-phase9-checkpoint-${run}.json`;
    clearWorkerCheckpoint(testCpPath);

    const firstCycle = await runAutopilotReevaluationCycle({
      specificOrgId: orgA,
      chunkSize: 2,
      maxItemsPerOrganization: 4,
      checkpointStorePath: testCpPath,
    });

    expect(firstCycle.organizationsProcessed).toBe(1);
    expect(firstCycle.totalEvaluated).toBeLessThanOrEqual(4);
    expect(firstCycle.durationMs).toBeGreaterThan(0);
    expect(firstCycle.memoryUsage.heapUsedMB).toBeGreaterThan(0);

    // Segundo ciclo sem limite de itens completa o restante
    const secondCycle = await runAutopilotReevaluationCycle({
      specificOrgId: orgA,
      chunkSize: 10,
      maxItemsPerOrganization: 100,
      checkpointStorePath: testCpPath,
    });

    expect(secondCycle.totalEvaluated).toBeGreaterThan(0);

    // Conferir auditoria em price_change_history
    const historyRows = await db
      .select()
      .from(priceChangeHistory)
      .where(eq(priceChangeHistory.organizationId, orgA));
    expect(historyRows.length).toBeGreaterThan(0);

    // Verificar que nenhum preço violou o piso rentável: cost / (1 - fees - additional - minMargin)
    // 60 / (1 - 0.10 - 0.05 - 0.20) = 60 / 0.65 = 92.31
    for (const h of historyRows) {
      expect(Number(h.newPrice)).toBeGreaterThanOrEqual(Number(h.minimumPrice));
      expect(Number(h.minimumPrice)).toBeGreaterThanOrEqual(92.30);
    }

    clearWorkerCheckpoint(testCpPath);
  });

  it("retoma em outro processo após crash entre preço e checkpoint sem duplicar lote", async () => {
    const workerItems = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(
      eq(inventoryItems.organizationId, orgA), like(inventoryItems.organizationSku, `WORKER-CHUNK-${run}-%`),
    ));
    expect(workerItems.length).toBeGreaterThan(0);
    for (const item of workerItems) {
      await db.update(inventoryItems).set({ price: "110.00" }).where(eq(inventoryItems.id, item.id));
    }
    const childCode = (crash: boolean) => `const M=require('module');const old=M._resolveFilename;M._resolveFilename=function(r,...rest){return r==='server-only'?require.resolve('./src/lib/server-only-shim.ts'):old.call(this,r,...rest)};import('./src/server/autopilot/worker.ts').then(m=>m.runAutopilotReevaluationCycle({specificOrgId:'${orgA}',chunkSize:100,maxItemsPerOrganization:100,maxExecutionTimeMs:45000,testCrashAfterApply:${crash}})).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})`;
    const runChild = (crash: boolean) => spawnSync(process.execPath, ["--import", "tsx", "-e", childCode(crash)], {
      cwd: process.cwd(), env: { ...process.env, APP_ENV: "test" }, encoding: "utf8", timeout: 120_000,
    });
    const crashed = runChild(true);
    expect(crashed.status, crashed.stderr).toBe(73);
    const [state] = await db.select().from(autopilotWorkerState).where(eq(autopilotWorkerState.id, 1));
    expect(state.status).toBe("running");
    expect(state.lastItemId).toBeNull();
    const firstBatches = await db.select().from(priceChangeBatches).where(and(
      eq(priceChangeBatches.organizationId, orgA), like(priceChangeBatches.idempotencyKey, `${state.runId}:%`),
    ));
    expect(firstBatches).toHaveLength(1);
    await db.update(autopilotWorkerState).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(autopilotWorkerState.id, 1));
    const resumed = runChild(false);
    expect(resumed.status, resumed.stderr).toBe(0);
    const repeated = await db.select().from(priceChangeBatches).where(eq(priceChangeBatches.id, firstBatches[0].id));
    expect(repeated).toHaveLength(1);
    const history = await db.select().from(priceChangeHistory).where(eq(priceChangeHistory.batchId, firstBatches[0].id));
    expect(history).toHaveLength(1);
    await db.update(inventoryItems).set({ price: "110.00" }).where(eq(inventoryItems.id, history[0].inventoryItemId));
    await expect(applyPriceBatch(orgA, null, {
      channel: "counter", itemIds: [history[0].inventoryItemId], applyAllSafe: false,
      source: "autopilot_auto", idempotencyKey: `stale-${run}`,
      workerFence: { workerId: state.workerId!, version: state.fencingVersion },
    })).rejects.toThrow("Lease do worker perdido");
  }, 120_000);

  it("impede deleção de conexões por outra organização", async () => {
    // Loja B tenta deletar conexão da Loja A -> deve retornar false/não deletar
    const deleteCross = await deleteOrganizationConnection(orgB, connectionAId);
    expect(deleteCross).toBe(false);

    // Conexão permanece intacta
    const listA = await listOrganizationConnections(orgA);
    expect(listA.some((c) => c.id === connectionAId)).toBe(true);

    // Deleção pela própria Loja A funciona
    const deleteOwn = await deleteOrganizationConnection(orgA, connectionAId);
    expect(deleteOwn).toBe(true);
  });
});
