import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalListings, inventoryItems, loginAttempts, memberships, organizations, priceChangeHistory, productVariants, publicActionLimits, sources, users } from "@/db/schema";
import { assertPublicActionAllowed } from "@/server/auth/public-rate-limit";
import { AutopilotBusyError, runAutopilotReevaluationCycle } from "@/server/autopilot/worker";
import { createPricingRule } from "@/server/autopilot/service";
import { createPricingRuleSchema } from "@/server/autopilot/schemas";
import { createInventoryBatch, createInventoryItem, listAllInventory, updateInventoryItem } from "@/server/inventory/service";
import { inventoryInputSchema } from "@/server/inventory/schemas";
import { importBrlMarketReferences } from "@/server/market/partner-import";
import { brlMarketRowSchema, parseBrlMarketCsv } from "@/server/market/partner-csv";
import { getOrganizationMarketHistory } from "@/server/market/history";
import { getMarketData, linkAndCollect } from "@/server/market/service";
import { tcgdexConnector } from "@/server/market/tcgdex";
import { hashPassword } from "@/server/auth/password";
import { assertLoginAllowed, clearLoginFailures, getLoginOriginHash, recordLoginFailure } from "@/server/auth/rate-limit";
import { authOptions } from "@/server/auth/options";
import { pricingPolicySchema } from "@/server/settings/schemas";
import { upsertActivePricingPolicy } from "@/server/settings/service";
import { listRecommendations, refreshRecommendations } from "@/server/recommendations/service";
import { applyPriceBatch, AutopilotConflictError, getAutopilotQueue, rollbackPriceBatch } from "@/server/autopilot/service";

const run = Date.now().toString();
const password = randomBytes(24).toString("base64url");
let orgA: string, orgB: string, userA: string, itemA: string, variantA: string, itemB: string;
const emailA = `synthetic-owner-${run}@phase81.invalid`;
const emailB = `synthetic-other-${run}@phase81.invalid`;
const emailMember = `synthetic-member-${run}@phase81.invalid`;
const input = (name: string, sku = "SAME-SKU") => inventoryInputSchema.parse({
  name, category: "TESTE_SINTETICO", sku, setName: "SYNTHETIC", collectorNumber: "001",
  language: "pt-BR", condition: "NM", finish: "standard", cost: 60, price: 110,
  quantity: 3, desiredMarginPercent: 25,
});
const quote = (name = "TESTE_SINTETICO Produto A", price = 120, daysAgo = 0) => brlMarketRowSchema.parse({
  productName: name, setName: "SYNTHETIC", collectorNumber: "001", language: "pt-BR",
  condition: "NM", finish: "standard", sourceName: "TESTE_SINTETICO PRIVADO",
  priceType: "reference", currency: "BRL", price,
  referenceAt: new Date(Date.now() - daysAgo * 86_400_000),
});

beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  const name = process.env.PHASE81_TEST_DATABASE;
  if (!name || !/^geekprice_phase81_test_\d+$/.test(name) || target.pathname !== `/${name}`) {
    throw new Error("Integration tests require the explicitly isolated Supabase database");
  }
  const rows = await db.execute(sql`select current_database() as name`);
  expect(rows[0].name).toBe(name);
  const [a, b] = await db.insert(organizations).values([
    { name: "TESTE_SINTETICO Loja A", slug: `synthetic-a-${run}`, onboardingCompletedAt: new Date() },
    { name: "TESTE_SINTETICO Loja B", slug: `synthetic-b-${run}`, onboardingCompletedAt: new Date() },
  ]).returning();
  orgA = a.id; orgB = b.id;
  const passwordHash = await hashPassword(password);
  const [owner, other, member] = await db.insert(users).values([
    { name: "TESTE_SINTETICO Owner A", email: emailA, passwordHash, emailVerifiedAt: new Date() },
    { name: "TESTE_SINTETICO Owner B", email: emailB, passwordHash, emailVerifiedAt: new Date() },
    { name: "TESTE_SINTETICO Member", email: emailMember, passwordHash, emailVerifiedAt: new Date() },
  ]).returning();
  userA = owner.id;
  await db.insert(memberships).values([
    { organizationId: orgA, userId: owner.id, role: "owner" },
    { organizationId: orgB, userId: other.id, role: "owner" },
    { organizationId: orgA, userId: member.id, role: "member" },
  ]);
  writeFileSync(".tools/phase81-fixtures.json", JSON.stringify({ database: name, orgA, orgB, emailA, emailB, emailMember, password }));
});

describe("PostgreSQL Supabase isolated integration", () => {
  it("records the exact complete migration chain and required indexes", async () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const rows = await db.execute(sql`select created_at from drizzle.__drizzle_migrations order by created_at`);
    expect(rows.map(r => Number(r.created_at))).toEqual(journal.entries.map((e: { when: number }) => e.when));
    const indexes = await db.execute(sql`select indexname from pg_indexes where schemaname='public'`);
    const names = indexes.map(i => i.indexname);
    expect(names).toContain("inventory_org_sku_uidx");
    expect(names).toContain("product_variants_sku_idx");
    expect(names).not.toContain("product_variants_sku_uidx");
    expect(names).toContain("alerts_org_created_idx");
    expect(names).toContain("price_observations_currency_region_idx");
  });

  it("creates independent products with the same internal SKU and prevents cross-organization edits", async () => {
    const a = await createInventoryItem(orgA, input("TESTE_SINTETICO Produto A"));
    const b = await createInventoryItem(orgB, { ...input("TESTE_SINTETICO Produto B"), quantity: 9 });
    itemA = a.id; variantA = a.variantId; itemB = b.id;
    expect(a.variantId).not.toBe(b.variantId);
    expect(a.organizationSku).toBe(b.organizationSku);
    expect(a.quantity).toBe(3); expect(b.quantity).toBe(9);
    expect(await updateInventoryItem(orgB, itemA, { price: "1.00" })).toBeNull();
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, variantA));
    expect(variant.sku).toContain(orgA);
    const own = await listAllInventory(orgB);
    expect(own.items.map(i => i.id)).not.toContain(itemA);
  });

  it("keeps inventory batch imports independent across organizations", async () => {
    await createInventoryBatch(orgA, [input("TESTE_SINTETICO Batch A", "BATCH-SAME")]);
    await createInventoryBatch(orgB, [input("TESTE_SINTETICO Batch B", "BATCH-SAME")]);
    const a = (await listAllInventory(orgA)).items.find(i => i.sku === "BATCH-SAME")!;
    const b = (await listAllInventory(orgB)).items.find(i => i.sku === "BATCH-SAME")!;
    expect(a.id).not.toBe(b.id); expect(a.name).not.toBe(b.name);
  });

  it("preserves long SKUs and serializes concurrent registrations", async () => {
    const prefix = "LONG-SKU-" + "X".repeat(105);
    const first = await createInventoryItem(orgA, input("TESTE_SINTETICO Long A", prefix + "A"));
    const second = await createInventoryItem(orgA, input("TESTE_SINTETICO Long B", prefix + "B"));
    expect(first.variantId).not.toBe(second.variantId);
    const simultaneous = await Promise.all([0, 1, 2].map(() => createInventoryItem(orgA, input("TESTE_SINTETICO Concurrent", "CONCURRENT-SKU"))));
    expect(new Set(simultaneous.map(i => i.id)).size).toBe(1);
  });

  it("rejects nonexistent, foreign, wrong-language and wrong-finish BRL variants atomically", async () => {
    for (const bad of [quote("TESTE_SINTETICO Inexistente"), quote("TESTE_SINTETICO Produto B"),
      { ...quote(), language: "en" }, { ...quote(), finish: "foil" }]) {
      await expect(importBrlMarketReferences(orgA, [quote(), bad])).rejects.toThrow();
    }
    expect((await db.select().from(sources).where(eq(sources.organizationId, orgA))).length).toBe(0);
  });

  it("persists BRL observations, queries them and deduplicates repeated import", async () => {
    const rows = [quote(), quote(undefined, 118, 1)];
    expect((await importBrlMarketReferences(orgA, rows)).insertedObservations).toBe(2);
    expect((await importBrlMarketReferences(orgA, rows)).insertedObservations).toBe(0);
    const market = await getMarketData(orgA, { currency: "BRL", days: 30 });
    expect(market.length).toBeGreaterThan(0);
    const [source] = await db.select().from(sources).where(eq(sources.organizationId, orgA));
    expect(source.config).toMatchObject({ type: "private", verified: false });
    expect((await listAllInventory(orgA)).items.find(i => i.id === itemA)?.marketPrice).toBe(119);
    expect((await listAllInventory(orgB)).items.find(i => i.id === itemB)?.marketPrice).toBeNull();
  });

  it("does not expose private references even when canonical variants are shared", async () => {
    await db.insert(inventoryItems).values({ organizationId: orgB, variantId: variantA, organizationSku: "SHARED-CANONICAL", cost: "60", price: "110", quantity: 1 });
    const shared = (await listAllInventory(orgB)).items.find(i => i.sku === "SHARED-CANONICAL")!;
    expect(shared.marketPrice).toBeNull();
    expect(await getMarketData(orgB, { currency: "BRL", days: 30 })).toHaveLength(0);
    expect((await getOrganizationMarketHistory(orgB)).hasData).toBe(false);
  });

  it("reads real historical dates and leaves store prices empty without observations", async () => {
    const history = await getOrganizationMarketHistory(orgA);
    expect(history.hasData).toBe(true);
    expect(history.points).toHaveLength(2);
    expect(history.points.every(p => p.storePrice === null)).toBe(true);
    expect(history.summary?.totalObservations).toBe(2);
  });

  it("keeps separate catalogue links for conditions of the same card", async () => {
    const first = await createInventoryItem(orgA, input("TESTE_SINTETICO Carta NM", "LINK-NM"));
    const second = await createInventoryItem(orgA, { ...input("TESTE_SINTETICO Carta Played", "LINK-PLAYED"), condition: "played" });
    const getCard = vi.spyOn(tcgdexConnector, "getCard").mockResolvedValue({ id: "synthetic-1", name: "TESTE_SINTETICO Carta", localId: "1", setId: "synthetic", setName: "Synthetic", rarity: null, image: null, language: "pt-br", finishes: [], prices: [] });
    try {
      await linkAndCollect(orgA, { inventoryItemId: first.id, externalCardId: "synthetic-1", language: "pt-br" });
      await linkAndCollect(orgA, { inventoryItemId: second.id, externalCardId: "synthetic-1", language: "pt-br" });
      const source = (await db.select().from(sources).where(eq(sources.organizationId, orgA))).find((row) => row.kind === "tcgdex")!;
      const links = await db.select().from(externalListings).where(eq(externalListings.sourceId, source.id));
      expect(links.map((link) => link.variantId)).toEqual(expect.arrayContaining([first.variantId, second.variantId]));
      expect(new Set(links.map((link) => link.externalId)).size).toBe(links.length);
    } finally {
      getCard.mockRestore();
    }
  });

  it("calculates persisted recommendations against independently derived profitable floors", async () => {
    await upsertActivePricingPolicy(orgA, pricingPolicySchema.parse({ name: "TESTE_SINTETICO", feePercent: 10, additionalCostPercent: 5, minimumMarginPercent: 20, desiredMarginPercent: 25, marketDiscountPercent: 0 }));
    await refreshRecommendations(orgA);
    const list = await listRecommendations(orgA);
    const item = list.find(i => i.inventoryItemId === itemA)!;
    expect(item.minimumPrice).toBe(92.31); // 60 / (1 - .10 - .05 - .20)
    expect(item.suggestedPrice).toBeGreaterThanOrEqual(60 / .65);
    expect(item.suggestedPrice).toBeGreaterThanOrEqual(60 / .60);
    expect(list.every(i => i.suggestedPrice >= i.minimumPrice)).toBe(true);
  });

  it("supervises an Autopilot approval, audits it, isolates it and rolls it back", async () => {
    const queue = await getAutopilotQueue(orgA);
    const item = [...queue.safe, ...queue.flagged, ...queue.unchanged].find(i => i.id === itemA)!;
    expect(item.suggestedPrice).toBeGreaterThanOrEqual(item.minimumPrice);
    const approval = await applyPriceBatch(orgA, userA, { channel: "counter", itemIds: [itemA], applyAllSafe: false, notes: "TESTE_SINTETICO supervised" });
    expect(approval.success).toBe(true);
    const [audit] = await db.select().from(priceChangeHistory).where(eq(priceChangeHistory.batchId, approval.batch!.id));
    expect(audit.previousPrice).toBe("110.00");
    expect(Number(audit.newPrice)).toBeGreaterThanOrEqual(Number(audit.minimumPrice));
    const duplicateApproval = await applyPriceBatch(orgA, userA, { channel: "counter", itemIds: [itemA], applyAllSafe: false });
    expect(duplicateApproval.success).toBe(false);
    expect(await db.select().from(priceChangeHistory).where(eq(priceChangeHistory.inventoryItemId, itemA))).toHaveLength(1);
    expect((await listAllInventory(orgB)).items.find(i => i.id === itemB)?.currentPrice).toBe(110);
    await expect(rollbackPriceBatch(orgB, userA, approval.batch!.id)).rejects.toThrow();
    expect((await rollbackPriceBatch(orgA, userA, approval.batch!.id)).success).toBe(true);
    expect((await listAllInventory(orgA)).items.find(i => i.id === itemA)?.currentPrice).toBe(110);
    await expect(rollbackPriceBatch(orgA, userA, approval.batch!.id)).rejects.toBeInstanceOf(AutopilotConflictError);
  });

  it("rejects a mixed valid and invalid price selection without partial updates", async () => {
    const before = (await listAllInventory(orgA)).items.find((item) => item.id === itemA)!.currentPrice;
    const result = await applyPriceBatch(orgA, userA, {
      channel: "counter",
      itemIds: [itemA, "00000000-0000-4000-8000-000000000000"],
      applyAllSafe: false,
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain("nenhum preço foi alterado");
    expect((await listAllInventory(orgA)).items.find((item) => item.id === itemA)!.currentPrice).toBe(before);
  });

  it("never applies a cost-only simulation without a recent Brazilian market reference", async () => {
    const before = (await listAllInventory(orgB)).items.find((item) => item.id === itemB)!.currentPrice;
    const queue = await getAutopilotQueue(orgB);
    const candidate = [...queue.safe, ...queue.flagged, ...queue.unchanged].find((item) => item.id === itemB)!;
    expect(candidate.marketPrice).toBeNull();
    expect(candidate.safetyGate).toBe("missing_market_reference");
    const result = await applyPriceBatch(orgB, null, { channel: "counter", itemIds: [itemB], applyAllSafe: false });
    expect(result.success).toBe(false);
    expect(result.message).toContain("sem cotação BRL");
    expect((await listAllInventory(orgB)).items.find((item) => item.id === itemB)!.currentPrice).toBe(before);
  });

  it("rate limits distributed account attempts and recovers after expiry", async () => {
    const email = `synthetic-lock-${run}@phase81.invalid`;
    for (let i = 0; i < 10; i++) {
      const hash = getLoginOriginHash(`203.0.113.${i + 1}`);
      await assertLoginAllowed(email, hash); await recordLoginFailure(email, hash);
    }
    await expect(assertLoginAllowed(email, getLoginOriginHash("another-origin"))).rejects.toThrow("LOGIN_RATE_LIMITED");
    await db.update(loginAttempts).set({ lastAttemptAt: new Date(Date.now() - 31 * 60_000), lockedUntil: new Date(Date.now() - 1000) }).where(eq(loginAttempts.email, email));
    await expect(assertLoginAllowed(email, getLoginOriginHash("another-origin"))).resolves.toBeUndefined();
    await clearLoginFailures(email);
  });

  it("uses real password verification and blocks origin spoofing without trusted proxies", async () => {
    const provider = authOptions.providers[0] as unknown as { options: { authorize: (credentials: { email: string; password: string }, request: { headers: Record<string, string> }) => Promise<{ id: string } | null> } };
    expect((await provider.options.authorize({ email: emailA, password }, { headers: {} }))?.id).toBe(userA);
    for (let i = 0; i < 5; i++) expect(await provider.options.authorize({ email: emailA, password: "wrong-password" }, { headers: { "x-forwarded-for": `203.0.113.${i}` } })).toBeNull();
    await expect(provider.options.authorize({ email: emailA, password }, { headers: { "x-forwarded-for": "203.0.113.199" } })).rejects.toThrow("LOGIN_RATE_LIMITED");
    await db.update(loginAttempts).set({ lastAttemptAt: new Date(Date.now() - 31 * 60_000), lockedUntil: new Date(Date.now() - 1000) }).where(eq(loginAttempts.email, emailA));
    expect((await provider.options.authorize({ email: emailA, password }, { headers: {} }))?.id).toBe(userA);
    expect(await db.select().from(loginAttempts).where(eq(loginAttempts.email, emailA))).toHaveLength(0);
  });

  it("denies direct table access to Supabase anonymous and authenticated API roles", async () => {
    const rls = await db.execute(sql`select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity`);
    expect(rls).toHaveLength(0);
    for (const role of ["anon", "authenticated"]) {
      const privileges = await db.execute(sql`select has_table_privilege(${role}, 'public.users', 'SELECT') as allowed`);
      expect(privileges[0].allowed).toBe(false);
    }
  });

  it("does not bypass the login limit with simultaneous password attempts", async () => {
    const provider = authOptions.providers[0] as unknown as { options: { authorize: (credentials: { email: string; password: string }, request: { headers: Record<string, string> }) => Promise<unknown> } };
    const email = `synthetic-parallel-${run}@phase81.invalid`;
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => provider.options.authorize(
      { email, password: "wrong-password" }, { headers: { "x-forwarded-for": `203.0.113.${i}` } },
    )));
    expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(5);
    expect(attempts.filter(a => a.status === "rejected")).toHaveLength(7);
    const [stored] = await db.select().from(loginAttempts).where(eq(loginAttempts.email, email));
    expect(stored.failedAttempts).toBe(5);
    await clearLoginFailures(email);
  });

  it("rejects invalid CSV currency, price and old dates without writes", () => {
    const header = "produto,moeda,valor,data_referencia";
    for (const row of [`TESTE_SINTETICO,USD,10,${new Date().toISOString()}`, `TESTE_SINTETICO,BRL,-1,${new Date().toISOString()}`, "TESTE_SINTETICO,BRL,10,2000-01-01"]) {
      expect(parseBrlMarketCsv(`${header}\n${row}`).errors.length).toBeGreaterThan(0);
    }
  });

  it("atomically admits public actions under concurrency without extending blocked locks", async () => {
    const action = `synthetic-public-${run}`;
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => assertPublicActionAllowed(
      new Request("http://localhost/test", { headers: { "x-forwarded-for": `203.0.113.${i}` } }), action, 3, 60_000,
    )));
    expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(3);
    expect(attempts.filter(a => a.status === "rejected")).toHaveLength(9);
    const [stored] = await db.select().from(publicActionLimits).where(eq(publicActionLimits.action, action));
    expect(stored.attempts).toBe(3);
    await expect(assertPublicActionAllowed(new Request("http://localhost/test"), action, 3, 60_000)).rejects.toThrow();
    const [unchanged] = await db.select().from(publicActionLimits).where(eq(publicActionLimits.action, action));
    expect(unchanged.lockedUntil).toEqual(stored.lockedUntil);
    expect(unchanged.attempts).toBe(3);
  });

  it("recovers a one-attempt public limit after genuine wall-clock expiration", async () => {
    const action = `synthetic-expiry-${run}`;
    const request = new Request("http://localhost/test");
    await assertPublicActionAllowed(request, action, 1, 2_000);
    await expect(assertPublicActionAllowed(request, action, 1, 2_000)).rejects.toThrow();
    await new Promise(resolve => setTimeout(resolve, 2_100));
    await expect(assertPublicActionAllowed(request, action, 1, 2_000)).resolves.toBeUndefined();
  });

  it("cannot inject CSV values into inactive, verified, partner or shared sources", async () => {
    for (const [index, config] of [
      { type: "private", verified: false }, { type: "verified", verified: true }, { type: "partner", verified: true },
    ].entries()) {
      const sourceName = `TESTE_SINTETICO protected ${run}-${index}`;
      await db.insert(sources).values({ organizationId: orgA, name: sourceName, kind: "partner_csv", active: index !== 0, config });
      await expect(importBrlMarketReferences(orgA, [{ ...quote(), sourceName }])).rejects.toThrow("nao autoriza");
    }
    const name = `TESTE_SINTETICO shared ${run}`;
    const [shared] = await db.insert(sources).values({ organizationId: null, name, kind: "partner_csv", config: { type: "verified", verified: true } }).returning();
    await importBrlMarketReferences(orgA, [{ ...quote(), sourceName: name, price: 121 }]);
    const rows = await db.execute(sql`select count(*)::int as count from price_observations po join external_listings el on el.id=po.listing_id where el.source_id=${shared.id}::uuid`);
    expect(rows[0].count).toBe(0);
    const [untouched] = await db.select().from(sources).where(eq(sources.id, shared.id));
    expect(untouched.config).toEqual({ type: "verified", verified: true });
  });

  it("runs the worker only on synthetic data and honors opt-in auto-apply", async () => {
    const [org] = await db.insert(organizations).values({ name: "TESTE_SINTETICO Worker", slug: `synthetic-worker-${run}` }).returning();
    const item = await createInventoryItem(org.id, input("TESTE_SINTETICO Worker Item", `WORKER-${run}`));
    await importBrlMarketReferences(org.id, [quote("TESTE_SINTETICO Worker Item", 120)]);
    const policy = createPricingRuleSchema.parse({ name: "TESTE_SINTETICO Worker Rule", roundingMode: "none", feePercent: 10, additionalCostPercent: 5, minimumMarginPercent: 20, desiredMarginPercent: 25, marketDiscountPercent: 0, autoApplySafe: false });
    const rule = await createPricingRule(org.id, policy);
    const disabled = await runAutopilotReevaluationCycle({ specificOrgId: org.id });
    expect(disabled.appliedCount).toBe(0);
    const [before] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id));
    expect(before.price).toBe("110.00");
    await db.execute(sql`update pricing_rules set auto_apply_safe=true where id=${rule.id}::uuid`);
    const enabled = await runAutopilotReevaluationCycle({ specificOrgId: org.id });
    expect(enabled.organizationsProcessed).toBe(1); expect(enabled.appliedCount).toBe(1);
    const [after] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id));
    expect(after.price).toBe("120.00");
    const [audit] = await db.select().from(priceChangeHistory).where(eq(priceChangeHistory.inventoryItemId, item.id));
    expect(Number(audit.newPrice)).toBeGreaterThanOrEqual(Number(audit.minimumPrice));
    expect((await listAllInventory(orgB)).items.find(i => i.id === itemB)?.currentPrice).toBe(110);
  });

  it("rejects a concurrent worker while another database session owns the cycle lock", async () => {
    const reserved = await db.$client.reserve();
    try {
      const [lock] = await reserved`select pg_try_advisory_lock(hashtextextended('geekprice:autopilot-worker', 0)) as acquired`;
      expect(lock.acquired).toBe(true);
      await expect(runAutopilotReevaluationCycle({ specificOrgId: orgA })).rejects.toBeInstanceOf(AutopilotBusyError);
    } finally {
      await reserved`select pg_advisory_unlock(hashtextextended('geekprice:autopilot-worker', 0))`;
      reserved.release();
    }
  });

  it("aborts stale approval when cost changes while the price update is blocked", async () => {
    const [org] = await db.insert(organizations).values({ name: "TESTE_SINTETICO Cost Race", slug: `synthetic-cost-race-${run}` }).returning();
    const [owner] = await db.insert(users).values({ name: "TESTE_SINTETICO Cost Owner", email: `synthetic-cost-${run}@phase81.invalid`, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }).returning();
    await db.insert(memberships).values({ organizationId: org.id, userId: owner.id, role: "owner" });
    const target = await createInventoryItem(org.id, input("TESTE_SINTETICO Cost Item", `COST-${run}`));
    await importBrlMarketReferences(org.id, [quote("TESTE_SINTETICO Cost Item", 120)]);
    let outcome: Promise<{ error?: Error; value?: unknown }> | undefined;
    await db.$client.begin(async blocker => {
      await blocker`select id from inventory_items where id=${target.id}::uuid for update`;
      outcome = applyPriceBatch(org.id, owner.id, { channel: "counter", itemIds: [target.id], applyAllSafe: false })
        .then(value => ({ value }), error => ({ error }));
      let waiting = false;
      for (let i = 0; i < 50; i++) {
        const status = await db.execute(sql`select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and (query like '%UPDATE inventory_items AS i%' or query like '%insert into "price_change_history"%')`);
        if (Number(status[0].count) > 0) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(waiting).toBe(true);
      await blocker`update inventory_items set cost=600 where id=${target.id}::uuid`;
    });
    const result = await outcome!;
    expect(result.error).toBeInstanceOf(AutopilotConflictError);
    expect(result.error?.message).toContain("custo mudou");
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, target.id));
    expect(item.price).toBe("110.00");
    expect(await db.select().from(priceChangeHistory).where(eq(priceChangeHistory.inventoryItemId, target.id))).toHaveLength(0);
    await db.update(inventoryItems).set({ cost: "60.00" }).where(eq(inventoryItems.id, target.id));
  });

  it("excludes stale BRL observations from inventory pricing", async () => {
    const [org] = await db.insert(organizations).values({ name: "TESTE_SINTETICO Stale Price", slug: `synthetic-stale-${run}` }).returning();
    const item = await createInventoryItem(org.id, input("TESTE_SINTETICO Stale Item", `STALE-${run}`));
    await importBrlMarketReferences(org.id, [quote("TESTE_SINTETICO Stale Item", 120)]);
    expect((await listAllInventory(org.id)).items.find(i => i.id === item.id)?.marketPrice).toBe(120);
    await importBrlMarketReferences(org.id, [{ ...quote("TESTE_SINTETICO Stale Item", 119), priceType: "listing" }]);
    const groups = await getMarketData(org.id, { currency: "BRL", days: 30 });
    expect(groups.map((group) => group.priceType).sort()).toEqual(["listing", "reference"]);
    expect(groups.every((group) => group.sourceType === "private" && group.sourceVerified === false)).toBe(true);
    expect((await listAllInventory(org.id)).items.find(i => i.id === item.id)?.marketPrice).toBe(120);
    await db.execute(sql`update price_observations as po set reference_at = now() - interval '31 days'
      from external_listings as el where po.listing_id = el.id and el.variant_id = ${item.variantId}::uuid`);
    expect((await listAllInventory(org.id)).items.find(i => i.id === item.id)?.marketPrice).toBeNull();
  });
});
