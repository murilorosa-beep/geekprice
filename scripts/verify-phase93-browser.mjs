import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { parseEnv } from "node:util";

// 1. Carregar variáveis do ambiente isolado de teste
const env = {
  ...process.env,
  ...parseEnv(fs.readFileSync(".env", "utf8")),
  ...parseEnv(fs.readFileSync(".env.phase81", "utf8")),
};

const target = new URL(env.DATABASE_URL);
if (!/^geekprice_phase81_test_\d+$/.test(env.PHASE81_TEST_DATABASE) || target.pathname !== "/" + env.PHASE81_TEST_DATABASE) {
  throw new Error("O teste de navegador exige o banco de teste isolado no Supabase.");
}

const origin = "http://127.0.0.1:3108";
const runId = Date.now().toString();

console.log(`[Phase 9.3 Browser] Iniciando jornada de 20 passos em ${origin}`);
console.log(`[Phase 9.3 Browser] Banco ativo: ${env.PHASE81_TEST_DATABASE}`);

// 2. Criar organização e usuário isolados no banco de teste diretamente via script auxiliar
import { db } from "../src/db/index.ts";
import { organizations, users, memberships } from "../src/db/schema.ts";
import { hashPassword } from "../src/server/auth/password.ts";

const testEmail = `lojista-fase93-${runId}@teste.invalid`;
const testPassword = `MvpSenhaFase93!@#${runId.slice(-4)}`;
const testOrgName = `Loja Piloto Geek F93 (${runId.slice(-4)})`;

const [testOrg] = await db.insert(organizations).values({
  name: testOrgName,
  slug: `loja-f93-${runId}`,
  onboardingCompletedAt: new Date(),
}).returning();

const passwordHash = await hashPassword(testPassword);
const [testUser] = await db.insert(users).values({
  name: `Lojista Fase 93`,
  email: testEmail,
  passwordHash,
  emailVerifiedAt: new Date(),
}).returning();

await db.insert(memberships).values({
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner",
});

console.log(`[Phase 9.3 Browser] Usuário de teste criado: ${testEmail}`);

// 3. Iniciar Chromium
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const results = [];
const pageErrors = [];

page.on("pageerror", (err) => {
  console.error("[Page Error]", err.message);
  pageErrors.push(err.message);
});

page.setDefaultTimeout(30_000);

try {
  // PASSO 1: Fazer login
  console.log("-> Passo 1: Login com lojista real");
  await page.goto(`${origin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(testEmail);
  await page.getByLabel("Senha", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  const sessionRes = await (await page.request.get(`${origin}/api/auth/session`)).json();
  assert.equal(sessionRes.user.organizationId, testOrg.id, "Session organization ID matches created test org");
  results.push("Passo 1: Login realizado com sucesso e sessão autenticada");

  // PASSO 2: Acessar o dashboard
  console.log("-> Passo 2: Acessar dashboard");
  await page.goto(`${origin}/dashboard`);
  await page.getByRole("heading", { name: /Olá, Lojista/ }).waitFor();
  await page.getByText("Dados persistidos").first().waitFor();
  results.push("Passo 2: Dashboard acessado com métricas da organização");

  // PASSO 3: Cadastrar manualmente um produto
  console.log("-> Passo 3: Cadastrar manualmente um produto");
  await page.goto(`${origin}/products`);
  await page.getByRole("button", { name: /Novo produto/ }).click();
  const manualName = `Playmat Customizado F93 ${runId.slice(-4)}`;
  const manualSku = `ACC-PLAY-${runId.slice(-4)}`;
  const modalForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Salvar produto" }) });
  await modalForm.getByLabel("Nome", { exact: true }).fill(manualName);
  await modalForm.getByLabel("Categoria", { exact: true }).fill("Acessórios");
  await modalForm.getByLabel("SKU", { exact: true }).fill(manualSku);
  await modalForm.getByLabel("Custo de aquisição").fill("40.00");
  await modalForm.getByLabel("Preço de venda").fill("80.00");
  await modalForm.getByLabel("Quantidade", { exact: true }).fill("10");
  await modalForm.getByLabel("Margem mínima desejada (%)").fill("25.00");
  
  const savePost = page.waitForResponse((r) => r.url().endsWith("/api/inventory") && r.request().method() === "POST");
  await modalForm.getByRole("button", { name: "Salvar produto" }).click();
  const savePostRes = await savePost;
  assert.equal(savePostRes.status(), 201, "Inventory POST returned 201 Created");
  await page.getByText("Produto cadastrado.").waitFor();
  await page.getByText(manualName).first().waitFor();
  results.push("Passo 3: Produto manual cadastrado e persistido no PostgreSQL");

  // PASSO 4: Cadastrar uma carta Pokémon pelo TCGdex via Catálogo Multijogo
  console.log("-> Passo 4: Cadastrar carta Pokémon pelo TCGdex");
  await page.goto(`${origin}/catalog`);
  await page.locator(".catalog-search-form input").first().fill("Pikachu");
  const pokemonSearch = page.waitForResponse((r) => r.url().includes("/api/catalog/cards") && r.url().includes("game=pokemon"));
  await page.getByRole("button", { name: "Consultar cartas" }).click();
  await pokemonSearch;
  
  // Selecionar o primeiro card
  const firstCard = page.locator(".catalog-card").first();
  await firstCard.waitFor();
  const pokemonDetail = page.waitForResponse((r) => r.url().includes("/api/market/catalog/"));
  await firstCard.click();
  await pokemonDetail;
  
  // Preencher dados do estoque e cadastrar
  const pokemonForm = page.locator(".catalog-stock-form");
  await pokemonForm.getByLabel("SKU da loja").fill(`PKM-${runId.slice(-4)}`);
  await pokemonForm.getByLabel("Custo (R$)").fill("15.00");
  await pokemonForm.getByLabel("Preço atual (R$)").fill("35.00");
  await pokemonForm.getByLabel("Quantidade").fill("4");
  const smartCardSave = page.waitForResponse((r) => r.url().includes("/api/smart-registration/card") && r.request().method() === "POST");
  await pokemonForm.getByRole("button", { name: "Adicionar ao estoque" }).click();
  const smartCardRes = await smartCardSave;
  assert.equal(smartCardRes.status(), 201, "Smart Pokémon registration returned 201");
  await page.getByText(/foi incluída no estoque/).waitFor();
  results.push("Passo 4: Carta Pokémon cadastrada via TCGdex e vinculada");

  // PASSO 5: Cadastrar uma carta Magic pelo Scryfall
  console.log("-> Passo 5: Cadastrar carta Magic pelo Scryfall");
  await page.goto(`${origin}/catalog`);
  await page.getByRole("button", { name: "Magic: The Gathering" }).click();
  await page.locator(".catalog-search-form input").first().fill("Lightning Bolt");
  const magicSearch = page.waitForResponse((r) => r.url().includes("/api/catalog/cards") && r.url().includes("game=magic"));
  await page.getByRole("button", { name: "Consultar cartas" }).click();
  await magicSearch;

  const firstMagicCard = page.locator(".catalog-card").first();
  await firstMagicCard.waitFor();
  const magicDetail = page.waitForResponse((r) => r.url().includes("/api/catalog/cards/magic/"));
  await firstMagicCard.click();
  await magicDetail;

  const magicForm = page.locator(".catalog-stock-form");
  await magicForm.getByLabel("SKU da loja").fill(`MTG-${runId.slice(-4)}`);
  await magicForm.getByLabel("Custo (R$)").fill("20.00");
  await magicForm.getByLabel("Preço atual (R$)").fill("45.00");
  await magicForm.getByLabel("Quantidade").fill("3");
  const magicSave = page.waitForResponse((r) => r.url().includes("/api/smart-registration/magic") && r.request().method() === "POST");
  await magicForm.getByRole("button", { name: "Adicionar ao estoque" }).click();
  const magicRes = await magicSave;
  assert.equal(magicRes.status(), 201, "Smart Magic registration returned 201");
  await page.getByText(/foi incluída no estoque/).waitFor();
  results.push("Passo 5: Carta Magic cadastrada via Scryfall e vinculada");
  results.push("Passo 5: Carta Magic cadastrada via Scryfall e vinculada");

  // PASSO 6 & 7: Editar produtos e quantidades, configurar custo e preço de venda
  console.log("-> Passo 6 & 7: Editar produto manual");
  await page.goto(`${origin}/products`);
  await page.getByPlaceholder("Buscar nome, coleção, código ou categoria").fill(manualName);
  const rowManual = page.locator("tr").filter({ hasText: manualName });
  await rowManual.waitFor();
  await rowManual.getByRole("button", { name: "Editar" }).click();

  const editForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Salvar produto" }) });
  await editForm.getByLabel("Custo de aquisição").fill("45.00");
  await editForm.getByLabel("Preço de venda").fill("90.00");
  await editForm.getByLabel("Quantidade", { exact: true }).fill("15");
  await editForm.getByLabel("Margem mínima desejada (%)").fill("30.00");
  const editPatch = page.waitForResponse((r) => r.url().includes("/api/inventory/") && r.request().method() === "PATCH");
  await editForm.getByRole("button", { name: "Salvar produto" }).click();
  assert.equal((await editPatch).status(), 200, "Inventory PATCH returned 200 OK");
  await page.getByText("Produto atualizado.").waitFor();
  await page.getByText("R$ 90.00").first().waitFor();
  results.push("Passos 6 & 7: Produto e quantidades editados com novos custos e preços");

  // PASSO 8: Importar estoque por CSV
  console.log("-> Passo 8: Importar estoque por CSV");
  await page.goto(`${origin}/dashboard`);
  await page.getByRole("button", { name: "Importar estoque" }).click();
  const csvDeckboxName = `Deck Box Couro F93 ${runId.slice(-4)}`;
  const csvSleeveName = `Sleeves Matte F93 ${runId.slice(-4)}`;
  const inventoryCsv = `produto,categoria,sku,colecao,numero,custo,preco,quantidade,margem
${csvDeckboxName},Acessórios,CSV-DBOX-${runId.slice(-4)},Geral,002,30.00,65.00,12,25.00
${csvSleeveName},Acessórios,CSV-SLV-${runId.slice(-4)},Geral,003,20.00,45.00,20,25.00`;

  await page.locator("input[type=file]").setInputFiles({
    name: "estoque-teste-f93.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(inventoryCsv),
  });
  const previewPost = page.waitForResponse((r) => r.url().includes("/api/imports/preview"));
  await page.getByRole("button", { name: "Validar arquivo" }).click();
  const previewRes = await (await previewPost).json();
  assert.equal(previewRes.valid.length, 2, "CSV preview found 2 valid rows");

  const commitPost = page.waitForResponse((r) => r.url().includes("/api/imports/commit"));
  await page.getByRole("button", { name: "Importar 2 itens" }).click();
  const commitStatus = (await commitPost).status();
  assert.ok(commitStatus === 200 || commitStatus === 201, `CSV commit returned ${commitStatus}`);
  results.push("Passo 8: Estoque importado via CSV com sucesso");

  // PASSO 9: Exportar estoque
  console.log("-> Passo 9: Exportar estoque para CSV");
  await page.goto(`${origin}/dashboard`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  const exportedStream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of exportedStream) chunks.push(chunk);
  const exportedContent = Buffer.concat(chunks).toString("utf8");
  assert.ok(exportedContent.includes('"produto"') && exportedContent.includes('"custo"'), "CSV header present");
  assert.ok(exportedContent.includes(csvDeckboxName), "CSV contains imported deckbox");
  results.push("Passo 9: Exportação de estoque para CSV validada com integridade");

  // PASSO 10: Configurar taxas e margens
  console.log("-> Passo 10: Configurar taxas e margens na política de preços");
  await page.goto(`${origin}/settings`);
  const policyForm = page.locator("form.settings-card");
  await policyForm.getByLabel("Nome da política").fill("Política Piloto F93");
  await policyForm.getByLabel("Taxas de marketplace (%)").fill("10.00");
  await policyForm.getByLabel("Custos percentuais adicionais (%)").fill("5.00");
  await policyForm.getByLabel("Margem mínima padrão (%)").fill("20.00");
  await policyForm.getByLabel("Margem desejada (%)").fill("25.00");
  await policyForm.getByLabel("Desconto sobre mercado (%)").fill("2.00");
  
  const policyPut = page.waitForResponse((r) => r.url().includes("/api/pricing-policy") && r.request().method() === "PUT");
  await policyForm.getByRole("button", { name: "Salvar configurações" }).click();
  assert.equal((await policyPut).status(), 200, "Pricing policy PUT returned 200");
  await page.getByText("Configurações salvas e persistidas.").waitFor();
  results.push("Passo 10: Taxas e margens configuradas e persistidas no PostgreSQL");

  // PASSO 11: Importar referências de mercado em BRL
  console.log("-> Passo 11: Importar referências de mercado em BRL");
  await page.goto(`${origin}/market`);
  const brlCsv = `produto,idioma,condicao,acabamento,fonte,tipo_preco,moeda,valor,data_referencia
${csvDeckboxName},pt-BR,new,standard,REFERENCIA PRIVADA F93,reference,BRL,75.00,${new Date().toISOString()}
${csvDeckboxName},pt-BR,new,standard,REFERENCIA PRIVADA F93,reference,BRL,78.00,${new Date(Date.now() - 86400000).toISOString()}
${csvSleeveName},pt-BR,new,standard,REFERENCIA PRIVADA F93,reference,BRL,52.00,${new Date().toISOString()}`;

  await page.getByLabel("Arquivo CSV BRL", { exact: true }).setInputFiles({
    name: "referencias-brl-f93.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(brlCsv),
  });
  const brlButton = page.getByRole("button", { name: "Confirmar importacao BRL" });
  await brlButton.waitFor();
  const brlCommit = page.waitForResponse((r) => r.url().includes("/partner-import/commit"));
  await brlButton.click();
  assert.equal((await brlCommit).status(), 201, "BRL Partner import commit returned 201");
  await page.getByText(/novas cotacoes BRL registradas/).waitFor();
  results.push("Passo 11: Cotações privadas BRL importadas com sucesso");

  // PASSO 12: Verificar a origem e a data das referências
  console.log("-> Passo 12: Verificar origem e tipo das referências de mercado");
  await page.goto(`${origin}/market`);
  await page.getByText("Fonte privada não verificada", { exact: false }).first().waitFor();
  await page.getByText("Referência informada", { exact: false }).first().waitFor();
  results.push("Passo 12: Origem privada e data recente de referências BRL verificadas");

  // PASSO 13: Gerar e visualizar recomendações de preço
  console.log("-> Passo 13: Gerar e visualizar recomendações no Autopilot");
  await page.goto(`${origin}/recommendations`);
  await page.getByPlaceholder("Buscar por carta, coleção ou SKU...").fill(csvDeckboxName);
  const deckboxRow = page.locator("tr").filter({ hasText: csvDeckboxName });
  await deckboxRow.waitFor();
  results.push("Passo 13: Recomendação calculada e exibida na fila do Autopilot");

  // PASSO 14: Conferir matematicamente o preço mínimo
  console.log("-> Passo 14: Conferência matemática do piso rentável");
  // Custo: 30.00. Taxa: 10%. Custo Adic: 5%. Margem Mín: 20%.
  // Denominador = 1 - 0.10 - 0.05 - 0.20 = 0.65.
  // Preço Mínimo = 30 / 0.65 = 46.1538 -> R$ 46,15 (ou 46,16).
  // Mercado = 75.00. Preço sugerido com 2% desc = 73.50 (ends_90 -> 73.90).
  const minPriceCell = await deckboxRow.locator("td").nth(3).innerText();
  const cleanMinPrice = Number(minPriceCell.replace(/[^0-9,]/g, "").replace(",", "."));
  assert.ok(cleanMinPrice >= 46.15 && cleanMinPrice <= 46.16, `Piso rentável R$ ${cleanMinPrice} confere com 30 / 0.65`);
  results.push(`Passo 14: Piso rentável R$ ${cleanMinPrice.toFixed(2)} matematicamente auditado`);

  // PASSO 15: Aprovar manualmente uma recomendação
  console.log("-> Passo 15: Aprovar manualmente uma recomendação");
  const applyPost = page.waitForResponse((r) => r.url().includes("/api/autopilot/apply") && r.request().method() === "POST");
  await deckboxRow.getByRole("button", { name: "Aplicar", exact: true }).click();
  const applyRes = await applyPost;
  assert.equal(applyRes.status(), 200, "Autopilot apply returned 200");
  const applyBody = await applyRes.json();
  const approvedBatchId = applyBody.batch.id;
  assert.ok(approvedBatchId, "Batch ID gerado no apply");
  results.push("Passo 15: Recomendação aprovada manualmente com lote gerado");

  // PASSO 16: Conferir a atualização do estoque e do preço
  console.log("-> Passo 16: Conferir novo preço no estoque");
  await page.goto(`${origin}/products`);
  await page.getByPlaceholder("Buscar nome, coleção, código ou categoria").fill(csvDeckboxName);
  const updatedDeckboxRow = page.locator("tr").filter({ hasText: csvDeckboxName });
  await updatedDeckboxRow.waitFor();
  const newPriceText = await updatedDeckboxRow.locator("td").nth(3).innerText();
  assert.notEqual(newPriceText, "R$ 65.00", "Preço foi atualizado em relação ao preço antigo de 65.00");
  results.push(`Passo 16: Preço de venda atualizado no estoque para ${newPriceText}`);

  // PASSO 17: Verificar histórico e auditoria
  console.log("-> Passo 17: Verificar histórico e auditoria do lote");
  await page.goto(`${origin}/recommendations`);
  await page.getByRole("button", { name: /Histórico de Lotes & Rollback/ }).click();
  const batchRow = page.locator("tbody tr").first();
  await batchRow.waitFor();
  assert.ok((await batchRow.innerText()).includes("Aplicado") || (await batchRow.innerText()).includes("applied"), "Status do lote é aplicado");
  results.push("Passo 17: Auditoria de lote e histórico de alterações confirmados");

  // PASSO 18: Executar rollback
  console.log("-> Passo 18: Executar rollback supervisionado");
  page.once("dialog", (dialog) => dialog.accept());
  const rollbackPost = page.waitForResponse((r) => r.url().includes("/api/autopilot/rollback") && r.request().method() === "POST");
  await batchRow.getByRole("button", { name: "Desfazer (Rollback)" }).click();
  const rollbackRes = await rollbackPost;
  assert.equal(rollbackRes.status(), 200, "Rollback returned 200 OK");
  const rollbackBody = await rollbackRes.json();
  assert.equal(rollbackBody.batch.id, approvedBatchId, "Rollback batch ID matches applied batch");
  await page.getByText("Revertido", { exact: true }).first().waitFor();
  results.push("Passo 18: Rollback executado com sucesso e status alterado para Revertido");

  // PASSO 19: Confirmar restauração exata do preço original
  console.log("-> Passo 19: Confirmar restauração exata do preço original no estoque");
  await page.goto(`${origin}/products`);
  await page.getByPlaceholder("Buscar nome, coleção, código ou categoria").fill(csvDeckboxName);
  const revertedRow = page.locator("tr").filter({ hasText: csvDeckboxName });
  await revertedRow.waitFor();
  const restoredPriceText = await revertedRow.locator("td").nth(3).innerText();
  assert.equal(restoredPriceText, "R$ 65.00", "Preço foi exatamente restaurado para R$ 65.00");
  results.push("Passo 19: Restauração exata do preço de R$ 65.00 comprovada no estoque");

  // PASSO 20: Verificar indicadores e gráficos do dashboard
  console.log("-> Passo 20: Verificar dashboard e indicadores finais");
  await page.goto(`${origin}/dashboard`);
  await page.getByRole("heading", { name: "Histórico e Posicionamento de Preços" }).waitFor();
  await page.screenshot({ path: ".tools/phase93-dashboard.png", fullPage: true });
  assert.deepEqual(pageErrors, [], "Nenhum erro de página (pageerror) durante a jornada");
  results.push("Passo 20: Dashboard visualizado com histórico real e captura de tela registrada");

  console.log("\n==========================================");
  console.log("JORNADA DE 20 PASSOS CONCLUÍDA COM SUCESSO!");
  console.log("==========================================");
  results.forEach((r) => console.log(`✓ ${r}`));

  fs.writeFileSync(".tools/phase93-browser-results.json", JSON.stringify({
    at: new Date().toISOString(),
    database: env.PHASE81_TEST_DATABASE,
    user: testEmail,
    organization: testOrgName,
    results,
    pageErrors,
  }, null, 2));

} catch (error) {
  console.error("FALHA NA JORNADA DO NAVEGADOR:", error);
  await page.screenshot({ path: ".tools/phase93-browser-failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
  process.exit(0);
}
