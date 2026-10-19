import { z } from "zod";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { chromium, expect as baseExpect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { db } from "../src/db";
import { indexCards, indexImports, indexSources, inventoryItems, memberships, organizations, products, productVariants, users } from "../src/db/schema";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";

const expect = baseExpect.configure({ timeout: 30_000 });

async function main() {
  const target = assertIsolatedIndexDatabase();
  const secret = process.env.NEXTAUTH_SECRET;
  const base = process.env.INDEX_TEST_BASE_URL;
  if (!secret || !base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Use NEXTAUTH_SECRET e INDEX_TEST_BASE_URL locais.");
  const nonce = randomUUID().slice(0, 8);
  const fixtureSourceCode = `index_e2e_${nonce}`;
  const [organization] = await db.insert(organizations).values({ name: "Index HTTP Test", slug: `index-http-${nonce}`, onboardingCompletedAt: new Date() }).returning();
  const [user] = await db.insert(users).values({ name: "Index Tester", email: "index-e2e@localhost.test",
    passwordHash: "test-only-no-login", emailVerifiedAt: new Date() }).returning();
  let productId: string | null = null;
  try {
    await db.insert(memberships).values({ organizationId: organization.id, userId: user.id, role: "admin" });
    const [product] = await db.insert(products).values({ name: "Charizard", category: "Pokémon TCG",
      imageUrl: "https://assets.tcgdex.net/en/base/base1/4/high.webp" }).returning();
    productId = product.id;
    const [variant] = await db.insert(productVariants).values({ productId: product.id,
      sku: `index-e2e-${nonce}`, setName: "Base Set", collectorNumber: "004/102",
      language: "en", finish: "holo", condition: "near_mint", catalogSource: "tcgdex",
      canonicalId: "base1-4" }).returning();
    const [item] = await db.insert(inventoryItems).values({ organizationId: organization.id,
      variantId: variant.id, cost: "2500.00", price: "5000.00", quantity: 1,
      desiredMarginPercent: "25" }).returning();
    const token = await encode({ secret, token: { userId: user.id, organizationId: organization.id, role: "admin", email: "index-e2e@localhost.test", authVersion: 0 }, maxAge: 1800 });
    const cookie = `next-auth.session-token=${token}`;
    const unauthenticated = await fetch(`${base}/api/geekprice-index/v1/coverage`);
    assert.equal(unauthenticated.status, 401);
    const headers = { Cookie: cookie };
    const coverageResponse = await fetch(`${base}/api/geekprice-index/v1/coverage`, { headers });
    assert.equal(coverageResponse.status, 200);
    assert.match(coverageResponse.headers.get("cache-control") || "", /private/);
    const coverage = z.object({ data: z.object({ cards: z.number(), priced: z.number() }) }).parse(await coverageResponse.json()).data;
    assert.equal(coverage.cards, 70);
    assert.equal(coverage.priced, 70);
    const searchResponse = await fetch(`${base}/api/geekprice-index/v1/search?q=Charizard&game=pokemon`, { headers });
    assert.equal(searchResponse.status, 200);
    const cards = z.object({ data: z.array(z.object({ id: z.string().uuid(), canonicalId: z.string(), referenceBrl: z.string().nullable() })) }).parse(await searchResponse.json()).data;
    const baseSet = cards.find((card) => card.canonicalId === "pokemon_bs_004/102");
    assert.ok(baseSet);
    assert.equal(baseSet.referenceBrl, "5180.43");
    const priceResponse = await fetch(`${base}/api/geekprice-index/v1/cards/${baseSet.id}/price`, { headers });
    assert.equal(priceResponse.status, 200);
    const price = z.object({ data: z.object({ price: z.object({ askingMin: z.string(), providerAverage: z.string().nullable(), source: z.object({ name: z.string() }), autoApplyEligible: z.boolean() }) }) }).parse(await priceResponse.json()).data;
    assert.equal(price.price.askingMin, "1500.00");
    assert.equal(price.price.providerAverage, "5180.43");
    assert.equal(price.price.source.name, "MYP Cards");
    assert.equal(price.price.autoApplyEligible, false);
    const historyResponse = await fetch(`${base}/api/geekprice-index/v1/cards/${baseSet.id}/history`, { headers });
    assert.equal(historyResponse.status, 200);
    assert.equal(z.object({ data: z.array(z.object({ observedAt: z.string() })) }).parse(await historyResponse.json()).data.length, 1);
    const sourcesResponse = await fetch(`${base}/api/geekprice-index/v1/sources`, { headers });
    assert.equal(sourcesResponse.status, 200);
    assert.equal(z.object({ data: z.array(z.object({ name: z.string() })) }).parse(await sourcesResponse.json()).data[0].name, "MYP Cards");
    const matchesResponse = await fetch(`${base}/api/geekprice-index/v1/inventory/${item.id}`, { headers });
    assert.equal(matchesResponse.status, 200);
    const matches = z.object({ data: z.object({ status: z.string(), candidates: z.array(z.object({ match: z.string() })) }) }).parse(await matchesResponse.json()).data;
    assert.equal(matches.status, "exact");
    assert.equal(matches.candidates.filter((candidate: { match: string }) => candidate.match === "exact").length, 1);
    const selectResponse = await fetch(`${base}/api/geekprice-index/v1/inventory/${item.id}`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: baseSet.id }),
    });
    assert.equal(selectResponse.status, 200, await selectResponse.text());
    const previewResponse = await fetch(`${base}/api/geekprice-index/v1/inventory/${item.id}/preview`, { headers });
    assert.equal(previewResponse.status, 200);
    const preview = z.object({ data: z.object({ pricing: z.object({ referenceValue: z.string(), canManuallyApprove: z.boolean(), suggestedPrice: z.number(), minimumPrice: z.number() }) }) }).parse(await previewResponse.json()).data;
    assert.equal(preview.pricing.referenceValue, "5180.43");
    assert.equal(preview.pricing.canManuallyApprove, true);
    assert.ok(preview.pricing.suggestedPrice >= preview.pricing.minimumPrice);
    const unconfirmed = await fetch(`${base}/api/geekprice-index/v1/inventory/${item.id}/approve`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: baseSet.id, confirmedVariant: false, expectedCurrentPrice: "5000.00" }),
    });
    assert.notEqual(unconfirmed.status, 200);
    const browser = await chromium.launch({ headless: true,
      executablePath: resolve(".tools/playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe") });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies([{ name: "next-auth.session-token", value: token, url: base }]);
      const page = await context.newPage();
      await page.goto(`${base}/market`);
      await page.getByRole("tab", { name: "Index BRL" }).click();
      const index = page.getByRole("region", { name: "GeekPrice Index" });
      await expect(index.getByRole("heading", { name: "GeekPrice Index" })).toBeVisible();
      await index.getByLabel("Nome da carta").fill("Charizard");
      await index.getByRole("button", { name: "Buscar preços BRL" }).click();
      await index.getByRole("button", { name: /Charizard.*Base Set.*004\/102/ }).click();
      await expect(index).toContainText("R$ 1.500,00");
      await expect(index).toContainText("R$ 5.180,43");
      await expect(index.getByRole("link", { name: "MYP Cards" })).toHaveCount(2);
      mkdirSync(resolve(".tools"), { recursive: true });
      await page.screenshot({ path: resolve(".tools/geekprice-index-market-integrated.png"), fullPage: true });
      await page.getByRole("tab", { name: "Minhas cartas e preços" }).click();
      await page.getByRole("button", { name: "Index BRL · sugerir preço" }).click();
      const drawer = page.getByRole("dialog", { name: "GeekPrice Index e sugestão de preço" });
      await expect(drawer).toContainText("R$ 5.180,43");
      await expect(drawer).toContainText("Preço mínimo rentável");
      await drawer.getByRole("checkbox").check();
      await drawer.getByRole("button", { name: "Aprovar preço manualmente" }).click();
      await expect(drawer).toContainText("Preço atualizado para");
      await page.screenshot({ path: resolve(".tools/geekprice-index-stock-pricing.png"), fullPage: true });
      await drawer.getByRole("button", { name: "Reverter" }).click();
      await expect(drawer).toContainText("Preço anterior restaurado");
      await expect(drawer).toContainText("revertido");
      await page.goto(`${base}/geekprice-index-admin`);
      await expect(page.getByRole("heading", { name: "GeekPrice Index — Administração" })).toBeVisible();
      const csv = [
        "game,name,canonical_id,set_name,set_code,collector_number,image_url,language,finish,condition,price_min_brl,provider_average_brl,price_max_brl,observed_at,source_url,source_external_id",
        "pokemon,Index E2E Card,fixture-1,Test Set,TST,1,,en,,,,,,,,",
      ].join("\n");
      await page.getByLabel("Arquivo CSV").setInputFiles({ name: "index-e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await page.getByLabel("Código da fonte").fill(fixtureSourceCode);
      await page.getByLabel("Nome da fonte").fill("Fixture local sem preços");
      await page.getByLabel("URL base HTTPS").fill("https://example.test");
      await page.getByLabel("Data do retrato").fill("2026-10-15T18:00");
      await page.getByLabel("Referência de direitos/procedência").fill("Fixture local sem preços; sem uso comercial.");
      await page.getByRole("button", { name: "Validar e ver prévia" }).click();
      await expect(page.locator("body")).toContainText("1 linhas · 1 válidas · 0 com preço · 1 sem preço");
      await page.screenshot({ path: resolve(".tools/geekprice-index-admin-preview.png"), fullPage: true });
      await page.getByRole("button", { name: "Importar lote validado" }).click();
      await expect(page.locator("body")).toContainText("Importação concluída: 0 linhas com preço, 1 sem preço.");
    } finally { await browser.close(); }
    const [restored] = await db.select({ price: inventoryItems.price }).from(inventoryItems).where(eq(inventoryItems.id, item.id));
    assert.equal(restored.price, "5000.00");
    console.log(JSON.stringify({ target, unauthenticated: 401, cards: coverage.cards, priced: coverage.priced,
      searched: cards.length, askingMin: price.price.askingMin, source: price.price.source.name,
      matchedInventoryItems: 1, approved: true, rolledBack: true, adminImportPreviewAndCommit: true, chromium: "passed" }));
  } finally {
    const [fixtureSource] = await db.select({ id: indexSources.id }).from(indexSources)
      .where(eq(indexSources.code, fixtureSourceCode)).limit(1);
    if (fixtureSource) {
      await db.delete(indexImports).where(eq(indexImports.sourceId, fixtureSource.id));
      await db.delete(indexCards).where(eq(indexCards.catalogSource, fixtureSourceCode));
      await db.delete(indexSources).where(eq(indexSources.id, fixtureSource.id));
    }
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(organizations).where(eq(organizations.id, organization.id));
    if (productId) await db.delete(products).where(eq(products.id, productId));
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
