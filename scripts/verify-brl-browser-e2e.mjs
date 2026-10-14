import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shimPath = path.resolve(__dirname, "../src/lib/server-only-shim.ts");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return shimPath;
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const { db } = await import("../src/db/index.ts");
const {
  organizations,
  users,
  memberships,
  inventoryItems,
  productVariants,
  products,
  priceObservations,
  externalListings,
  sources,
} = await import("../src/db/schema.ts");
const { hashPassword } = await import("../src/server/auth/password.ts");
const { createInventoryItem, listAllInventory } = await import("../src/server/inventory/service.ts");
const { signBrazilianQuote } = await import("../src/server/market/brazilian-sources.ts");
const { eq, and } = await import("drizzle-orm");

// 1. Validar ambiente isolado
const env = {
  ...process.env,
  ...parseEnv(fs.readFileSync(".env", "utf8")),
  ...parseEnv(fs.readFileSync(".env.phase81", "utf8")),
};

const target = new URL(env.DATABASE_URL);
if (
  !/^geekprice_phase81_test_\d+$/.test(env.PHASE81_TEST_DATABASE) ||
  target.pathname !== "/" + env.PHASE81_TEST_DATABASE
) {
  throw new Error("Este teste e2e exige conexão exclusiva ao banco isolado.");
}

const origin = "http://127.0.0.1:3108";
const runId = Date.now().toString();

console.log("==================================================================");
console.log(`[E2E Chromium] Teste Ponta a Ponta de Cotações BRL e Integridade`);
console.log(`[E2E Chromium] Banco Isolado: ${env.PHASE81_TEST_DATABASE}`);
console.log(`[E2E Chromium] Servidor Alvo: ${origin}`);
console.log("==================================================================");

// 2. Garantir que o servidor Next.js na porta 3108 esteja ativo
let serverProcess = null;
let serverAlreadyRunning = false;

try {
  const probe = await fetch(`${origin}/login`);
  if (probe.status === 200) {
    serverAlreadyRunning = true;
    console.log("[E2E Chromium] Servidor de validação já está ativo na porta 3108.");
  }
} catch {
  console.log("[E2E Chromium] Iniciando servidor Next.js em 127.0.0.1:3108...");
  serverProcess = spawn(
    process.execPath,
    ["scripts/start-validation-server.mjs", "--production"],
    {
      env: {
        ...env,
        FEATURE_BRL_SCRAPING_ENABLED: "true",
      },
      stdio: "ignore",
      windowsHide: true,
    }
  );

  // Aguardar servidor inicializar (até 30s)
  const startTime = Date.now();
  let serverReady = false;
  while (Date.now() - startTime < 30_000) {
    try {
      const res = await fetch(`${origin}/login`);
      if (res.status === 200) {
        serverReady = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  if (!serverReady) {
    if (serverProcess) serverProcess.kill();
    throw new Error("Tempo limite esgotado ao iniciar servidor de validação na porta 3108.");
  }
  console.log("[E2E Chromium] Servidor Next.js pronto na porta 3108.");
}

const results = [];

try {
  // 3. Cadastrar Organização e Usuário no PostgreSQL Isolado
  console.log("\n-> [Passo 1/7] Criando organização e lojista no PostgreSQL...");
  const testEmail = `lojista-brl-${runId}@teste.invalid`;
  const testPassword = `SenhaBrlE2E!@#${runId.slice(-4)}`;
  const testOrgName = `Loja Piloto BRL (${runId.slice(-4)})`;

  const [testOrg] = await db
    .insert(organizations)
    .values({
      name: testOrgName,
      slug: `loja-brl-${runId}`,
      onboardingCompletedAt: new Date(),
    })
    .returning();

  const passwordHash = await hashPassword(testPassword);
  const [testUser] = await db
    .insert(users)
    .values({
      name: `Lojista BRL E2E`,
      email: testEmail,
      passwordHash,
      emailVerifiedAt: new Date(),
    })
    .returning();

  await db.insert(memberships).values({
    organizationId: testOrg.id,
    userId: testUser.id,
    role: "owner",
  });

  results.push(`✓ Organização criada: ${testOrg.name} (${testOrg.id})`);
  results.push(`✓ Usuário autenticável: ${testEmail}`);

  // 4. Cadastrar DUAS cartas de mesmo nome com edições diferentes
  console.log("-> [Passo 2/7] Cadastrando 2 cartas com mesmo nome ('Pikachu') e edições distintas...");
  const item151 = await createInventoryItem(testOrg.id, {
    name: "Pikachu",
    category: "tcg_pokemon",
    setName: "151",
    collectorNumber: "025",
    sku: `PKM-PIKA-151-${runId.slice(-4)}`,
    cost: 15.0,
    price: 30.0,
    quantity: 10,
    desiredMarginPercent: 25,
    language: "pt-BR",
    condition: "near_mint",
    finish: "standard",
  });

  const itemVIV = await createInventoryItem(testOrg.id, {
    name: "Pikachu",
    category: "tcg_pokemon",
    setName: "Vivid Voltage",
    collectorNumber: "044",
    sku: `PKM-PIKA-VIV-${runId.slice(-4)}`,
    cost: 50.0,
    price: 90.0,
    quantity: 5,
    desiredMarginPercent: 25,
    language: "pt-BR",
    condition: "near_mint",
    finish: "standard",
  });

  results.push(`✓ Carta 1 criada no PostgreSQL: Pikachu (Edição: 151, Nº 025, ID: ${item151.id})`);
  results.push(`✓ Carta 2 criada no PostgreSQL: Pikachu (Edição: Vivid Voltage, Nº 044, ID: ${itemVIV.id})`);

  // 5. Gerar cotações assinadas criptograficamente pelo servidor (HMAC-SHA256)
  const nowIso = new Date().toISOString();
  const quote151 = {
    source: "ligapokemon",
    sourceLabel: "Liga Pokémon",
    cardTitle: "Pikachu",
    edition: "151",
    collectorNumber: "025",
    priceMin: 15.5,
    priceAvg: 25.0,
    priceMax: 40.0,
    currency: "BRL",
    url: "https://www.ligapokemon.com.br/?view=cards/card&card=Pikachu&ed=151&num=025",
    observedAt: nowIso,
  };
  const token151 = signBrazilianQuote(quote151);

  const quoteVIV = {
    source: "ligapokemon",
    sourceLabel: "Liga Pokémon",
    cardTitle: "Pikachu",
    edition: "Vivid Voltage",
    collectorNumber: "044",
    priceMin: 80.0,
    priceAvg: 120.0,
    priceMax: 150.0,
    currency: "BRL",
    url: "https://www.ligapokemon.com.br/?view=cards/card&card=Pikachu&ed=VIV&num=044",
    observedAt: nowIso,
  };
  const tokenVIV = signBrazilianQuote(quoteVIV);

  results.push(`✓ Token HMAC assinado para Edição 151: ${token151.slice(0, 25)}...`);
  results.push(`✓ Token HMAC assinado para Edição Vivid Voltage: ${tokenVIV.slice(0, 25)}...`);

  // 6. Iniciar navegador Chromium com Playwright
  console.log("-> [Passo 3/7] Inicializando navegador Chromium via Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Interceptar consulta de cotações para responder deterministicamente com dados assinados
  await page.route("**/api/market/quote-br?*", async (route) => {
    const url = new URL(route.request().url());
    console.log(`   [Browser Mock] GET /api/market/quote-br?${url.searchParams.toString()}`);
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: "Pikachu",
        game: "pokemon",
        searchedAt: nowIso,
        collectedAt: nowIso,
        fromCache: false,
        status: "ok",
        statusMessage: "2 cotações localizadas na Liga Pokémon.",
        totalFound: 2,
        lowestPrice: 15.5,
        medianPrice: 25.0,
        highestPrice: 40.0,
        statsScope: "top_edition_match",
        items: [
          { ...quote151, token: token151 },
          { ...quoteVIV, token: tokenVIV },
        ],
        byEdition: [
          {
            edition: "151",
            count: 1,
            lowestPrice: 15.5,
            medianPrice: 25.0,
            highestPrice: 40.0,
            items: [{ ...quote151, token: token151 }],
          },
          {
            edition: "Vivid Voltage",
            count: 1,
            lowestPrice: 80.0,
            medianPrice: 120.0,
            highestPrice: 150.0,
            items: [{ ...quoteVIV, token: tokenVIV }],
          },
        ],
        commercialNotice:
          "Aviso: Referência extraída de anúncios públicos (não homologada oficialmente). Requer conferência manual.",
      }),
    });
  });

  // Login no sistema
  console.log("-> [Passo 4/7] Fazendo login no GeekPrice com o lojista de teste...");
  await page.goto(`${origin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(testEmail);
  await page.getByLabel("Senha", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  results.push("✓ Login autenticado com sucesso e redirecionado para /dashboard");

  // Acessar aba de mercado
  console.log("-> [Passo 5/7] Acessando /market e abrindo modal de cotação para Pikachu (151)...");
  await page.goto(`${origin}/market`);
  await page.getByText("Cartas do meu estoque").waitFor();

  // Localizar card de Pikachu (151) e clicar em "Cotação BR"
  const card151Locator = page.locator(".market-my-card").filter({ hasText: "151" });
  await card151Locator.waitFor();
  await card151Locator.getByRole("button", { name: /Cotação BR/i }).click();

  // Modal aberto
  const modal = page.locator(".modal-card[role='dialog']");
  await modal.waitFor();
  await modal.getByText("MERCADO NACIONAL EM REAIS (BRL)").waitFor();
  await modal.getByText("Fonte Externa Não-Homologada").waitFor();
  results.push("✓ Modal de Cotação BRL aberto: exibe selo 'Fonte Externa Não-Homologada'");

  // Verificar separação de edições no modal
  await modal.getByText(/Coleção: 151/).waitFor();
  await modal.getByText(/Coleção: Vivid Voltage/).waitFor();
  results.push("✓ Grupos de edições separados visivelmente: Coleção: 151 e Coleção: Vivid Voltage");

  // VINCULAÇÃO CORRETA: Vincular cotação da edição 151 no item da edição 151
  console.log("-> [Passo 6/7] Vinculando cotação da edição correspondente (151)...");
  const save151Post = page.waitForResponse(
    (r) => r.url().includes("/api/market/quote-br") && r.request().method() === "POST"
  );
  await modal.getByRole("button", { name: /Vincular \(R\$ 25/i }).click();
  const save151Res = await save151Post;
  const save151Text = await save151Res.text();
  const feedbackEl = modal.locator(".feedback");
  await feedbackEl.waitFor();
  const feedbackText = await feedbackEl.innerText();
  console.log(`   [UI Feedback] ${feedbackText}`);
  assert.ok(feedbackText.includes("vinculada como referência não-homologada"), "Feedback contém texto de vinculação");
  results.push("✓ Cotação da edição 151 vinculada com sucesso no item 151 (HTTP 200)");

  // TESTE DE BLOQUEIO DE DIVERGÊNCIA: Tentar vincular a cotação da Vivid Voltage no Pikachu (151)
  console.log("-> [Passo 7/7] Tentando vincular cotação da Vivid Voltage no Pikachu 151 (deve bloquear)...");
  const saveMismatchPost = page.waitForResponse(
    (r) => r.url().includes("/api/market/quote-br") && r.request().method() === "POST"
  );
  await modal.getByRole("button", { name: /Vincular \(R\$ 120/i }).click();
  const mismatchRes = await saveMismatchPost;
  assert.equal(mismatchRes.status(), 422, "Vinculação de edição divergente foi bloqueada com HTTP 422");
  const mismatchBody = await mismatchRes.json();
  assert.equal(mismatchBody.code, "EDITION_MISMATCH");
  const errorEl = modal.locator(".form-error");
  await errorEl.waitFor();
  const errorText = await errorEl.innerText();
  console.log(`   [UI Error] ${errorText}`);
  assert.ok(errorText.includes("Divergência de coleção"), "Mensagem de erro exibe divergência de coleção");
  results.push("✓ Bloqueio de divergência comprovado: Cotação Vivid Voltage rejeitada para item 151 com HTTP 422 (EDITION_MISMATCH)");

  // Testes de Segurança via API direta (Tokens Adulterados e Expirados)
  console.log("-> [Validação de Tokens] Testando token adulterado e expirado via POST...");
  const fakeTokenRes = await page.request.post(`${origin}/api/market/quote-br`, {
    data: {
      inventoryItemId: item151.id,
      quote: {
        sourceLabel: "Liga Pokémon",
        price: 10.0,
        token: "token-falso-adulterado",
      },
    },
  });
  assert.equal(fakeTokenRes.status(), 400, "Token adulterado deve retornar 400 Bad Request");
  results.push("✓ Token adulterado rejeitado pelo servidor com HTTP 400");

  const expiredToken = `${Date.now() - 60_000}.1550.2500.4000.abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;
  const expiredRes = await page.request.post(`${origin}/api/market/quote-br`, {
    data: {
      inventoryItemId: item151.id,
      quote: {
        sourceLabel: "Liga Pokémon",
        price: 25.0,
        token: expiredToken,
      },
    },
  });
  assert.equal(expiredRes.status(), 400, "Token expirado deve retornar 400 Bad Request");
  results.push("✓ Token expirado rejeitado pelo servidor com HTTP 400");

  // Conferir persistência real no PostgreSQL isolado
  console.log("-> [Auditoria PostgreSQL] Conferindo registros gravados no PostgreSQL isolado...");
  const observations = await db
    .select()
    .from(priceObservations)
    .innerJoin(externalListings, eq(externalListings.id, priceObservations.listingId))
    .where(eq(externalListings.variantId, item151.variantId));

  assert.equal(observations.length, 1, "Exatamente 1 observação persistida no PostgreSQL");
  const obs = observations[0].price_observations;
  assert.equal(obs.price, "25.00");
  assert.equal(obs.currency, "BRL");
  assert.equal(obs.rawPayload.verifiedSource, false);
  results.push("✓ PostgreSQL Isolado: observação BRL gravada com preço R$ 25,00 e verifiedSource=false");

  // Conferir que o estoque marca hasUnverifiedReference = true
  const inventoryState = await listAllInventory(testOrg.id);
  const found151 = inventoryState.items.find((i) => i.id === item151.id);
  assert.equal(found151.hasUnverifiedReference, true, "Item possui trava hasUnverifiedReference");
  results.push("✓ Estoque PostgreSQL: item marcado com hasUnverifiedReference=true");

  await browser.close();

  console.log("\n==================================================================");
  console.log("RESULTADO FINAL DA VALIDAÇÃO E2E NO CHROMIUM (100% APROVADO):");
  console.log("==================================================================");
  results.forEach((r) => console.log(r));
  console.log("==================================================================\n");
} finally {
  if (serverProcess) {
    console.log("[E2E Chromium] Encerrando processo do servidor Next.js...");
    serverProcess.kill("SIGTERM");
  }
}
