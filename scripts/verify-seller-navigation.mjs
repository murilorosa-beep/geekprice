import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const fixture = JSON.parse(readFileSync(".tools/phase81-fixtures.json", "utf8"));
const origin = process.env.SELLER_TEST_ORIGIN ?? "http://localhost:3108";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20_000);
let createdItemId = null;

async function login(email) {
  await page.goto(`${origin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/dashboard");
}

try {
  await login(fixture.emailB);
  const testName = `TESTE_SINTETICO Browser Carta ${Date.now()}`;
  const created = await page.request.post(`${origin}/api/inventory`, { data: {
    name: testName, category: "TESTE_SINTETICO", sku: `BROWSER-${Date.now()}`,
    setName: "Coleção sintética", collectorNumber: "1", language: "pt-BR",
    condition: "near_mint", finish: "standard", cost: 15, price: 30,
    quantity: 1, desiredMarginPercent: 25,
  } });
  assert.equal(created.status(), 201);
  createdItemId = (await created.json()).id;
  await page.goto(`${origin}/market`);
  const openCard = page.getByRole("button", { name: `Ver detalhes de ${testName}` });
  await openCard.waitFor();
  await openCard.click();
  const cardDialog = page.getByRole("dialog", { name: `Detalhes de ${testName}` });
  await cardDialog.getByText("Preço atual da loja").waitFor();
  const editLink = cardDialog.getByRole("link", { name: "Editar preço e estoque" });
  assert.match(await editLink.getAttribute("href"), /^\/products\?edit=/);
  await editLink.click();
  await page.waitForURL("**/products?edit=*");
  await page.getByRole("heading", { name: testName }).waitFor();
  await page.getByRole("button", { name: "Salvar produto" }).waitFor();

  await page.goto(`${origin}/recommendations`);
  const row = page.locator("tr").filter({ hasText: testName }).first();
  await row.getByRole("button", { name: "Ver detalhes" }).click();
  const priceDialog = page.getByRole("dialog", { name: `Revisão de preço de ${testName}` });
  await priceDialog.getByRole("link", { name: "Editar preço manualmente" }).waitFor();
  assert.equal(await priceDialog.getByRole("button", { name: /Alterar preço do estoque/ }).count(), 0);

  await page.route("**/api/market/catalog?*", async (route) => {
    await route.fulfill({ json: { items: [{ id: "synthetic-1", name: "Carta sintética", localId: "1", image: null, language: "pt-br" }] } });
  });
  await page.route("**/api/market/catalog/synthetic-1?*", async (route) => {
    await route.fulfill({ json: { id: "synthetic-1", name: "Carta sintética", localId: "1", image: null, language: "pt-br", setName: "Coleção sintética", rarity: "Rara", finishes: ["standard"], prices: [] } });
  });
  await page.goto(`${origin}/market`);
  await page.getByRole("tab", { name: "Buscar edição no catálogo" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("sintética");
  await page.getByRole("button", { name: "Buscar no catálogo" }).click();
  await page.getByRole("button", { name: /Carta sintética/ }).click();
  await page.getByRole("button", { name: "Adicionar esta edição ao meu estoque" }).click();
  await page.getByRole("heading", { name: "Confirme a variante e o estoque" }).waitFor();
  await page.getByText("Coleção sintética", { exact: false }).last().waitFor();
  console.log("OK: detalhes do estoque, edição manual, Autopilot sem BRL e cadastro a partir do Mercado.");
} finally {
  if (createdItemId) await page.request.delete(`${origin}/api/inventory/${createdItemId}`).catch(() => {});
  await browser.close();
}
