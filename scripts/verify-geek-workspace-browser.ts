import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { memberships, organizations, softwareProducts, subscriptions, users } from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";

const origin = process.env.GEEK_WORKSPACE_TEST_ORIGIN || "http://localhost:3109";
const target = new URL(process.env.DATABASE_URL!);
if (!/^geekprice_phase81_test_\d+$/.test(process.env.PHASE81_TEST_DATABASE || "") || target.pathname !== `/${process.env.PHASE81_TEST_DATABASE}`) throw new Error("Este teste requer banco isolado.");
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Este teste só acessa servidor local.");
const orgIds: string[] = [];
const userIds: string[] = [];
const password = `Test!${randomBytes(18).toString("hex")}`;
const stamp = randomUUID();
const screenshots = ".tools/geek-workspace-preview";
mkdirSync(screenshots, { recursive: true });

async function main() {
  const [product] = await db.select().from(softwareProducts).where(eq(softwareProducts.code, "geekprice")).limit(1);
  assert(product);
  const orgs = await db.insert(organizations).values(["Estúdio Universo", "Outra coleção"].map((name) => ({ name: `TESTE ${name}`, slug: `gw-${randomUUID()}`, onboardingCompletedAt: new Date() }))).returning();
  orgIds.push(...orgs.map((row) => row.id));
  const passwordHash = await hashPassword(password);
  const accounts = await db.insert(users).values(["owner", "other", "member"].map((role) => ({ name: "Pessoa de teste", email: `gw-${role}-${stamp}@example.test`, passwordHash, emailVerifiedAt: new Date() }))).returning();
  userIds.push(...accounts.map((row) => row.id));
  await db.insert(memberships).values(accounts.map((account, index) => ({ userId: account.id, organizationId: orgs[index === 1 ? 1 : 0].id, role: index === 2 ? "member" as const : "owner" as const })));
  await db.insert(subscriptions).values(orgs.map((org) => ({ organizationId: org.id, softwareProductId: product.id, plan: "trial", status: "trialing" as const, trialEndsAt: new Date(Date.now() + 86400000), productLimit: 500, memberLimit: 3 })));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function login(targetPage: Page, email: string) {
    await targetPage.goto(`${origin}/login`);
    await targetPage.getByLabel("E-mail", { exact: true }).fill(email);
    await targetPage.getByLabel("Senha", { exact: true }).fill(password);
    await targetPage.getByRole("button", { name: "Entrar na minha loja", exact: true }).click();
    await targetPage.waitForURL("**/dashboard");
  }
  try {
    await login(page, accounts[0].email);
    await page.goto(`${origin}/collections`);
    await page.getByRole("button", { name: "Adicionar à coleção", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título *", { exact: true }).fill("One Piece — volume 01");
    await dialog.getByLabel("Série / franquia").fill("One Piece");
    await dialog.getByLabel("Volume / edição / versão").fill("Vol. 01");
    await dialog.getByLabel("Custo por unidade (R$)").fill("29.90");
    await dialog.getByLabel("Localização").fill("Estante principal");
    await dialog.getByRole("button", { name: "Salvar item", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".gw-collectible h3")).toHaveText(["One Piece — volume 01"]);
    const collectionResponse = await page.request.get(`${origin}/api/collections`);
    const collection = await collectionResponse.json();
    const item = collection.items[0];
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Situação", { exact: true }).selectOption("loaned");
    await dialog.getByLabel("Emprestado para *").fill("Amigo da coleção");
    await dialog.getByLabel("Devolução prevista").fill("2026-01-01");
    await dialog.getByRole("button", { name: "Salvar item", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".gw-loan")).toContainText("Devolução atrasada");
    await page.getByRole("button", { name: "Editar / devolver" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Situação", { exact: true }).selectOption("owned");
    await dialog.getByRole("button", { name: "Salvar item", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".gw-loan")).toHaveCount(0);
    for (const [title, category, status, series, edition] of [["One Piece — volume 02", "manga", "wishlist", "One Piece", "Vol. 02"], ["Figure do explorador", "figure", "ordered", "Universo autoral", "Edição especial"], ["Carta do meu projeto", "card", "owned", "Criações próprias", "001"]]) {
      const result = await page.request.post(`${origin}/api/collections`, { data: { title, category, status, series, edition, quantity: 1, purchasePrice: "25" } });
      assert.equal(result.status(), 201);
    }
    await page.reload();
    await expect(page.locator(".gw-collectible")).toHaveCount(4);
    await page.getByRole("button", { name: "Filtrar Mangás", exact: true }).click();
    await expect(page.locator(".gw-collectible")).toHaveCount(2);
    await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue("manga");
    await page.getByRole("button", { name: "Filtrar Mangás", exact: true }).click();
    await expect(page.locator(".gw-collectible")).toHaveCount(4);
    await page.getByRole("button", { name: "Visualização em tabela", exact: true }).click();
    await expect(page.locator(".cg-table-item")).toHaveCount(4);
    await page.getByLabel("Custo mínimo", { exact: true }).fill("29");
    await expect(page.locator(".cg-table-item")).toHaveCount(1);
    await page.getByLabel("Custo mínimo", { exact: true }).fill("");
    await expect(page.locator(".cg-table-item")).toHaveCount(4);
    await page.getByRole("button", { name: "Visualização em coleção", exact: true }).click();
    await expect(page.locator(".gw-collectible")).toHaveCount(4);
    await page.screenshot({ path: `${screenshots}/collections-desktop.png`, fullPage: true });
    await page.getByLabel("Situação", { exact: true }).selectOption("wishlist");
    await expect(page.locator(".gw-collectible")).toHaveCount(1);
    await page.getByLabel("Situação", { exact: true }).selectOption("");
    await expect(page.locator(".gw-collectible")).toHaveCount(4);
    await page.goto(`${origin}/commissions`);
    await page.getByRole("button", { name: "Nova encomenda", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome do projeto *").fill("Armadura do explorador");
    await dialog.getByLabel("Cliente *", { exact: true }).fill("Cliente de demonstração");
    await dialog.getByLabel("Etapa atual").selectOption("production");
    await dialog.getByLabel("Entrega prevista").fill("2026-12-20");
    await dialog.getByRole("button", { name: "Material", exact: true }).click();
    await dialog.getByLabel("Material 1", { exact: true }).fill("EVA e acabamento");
    await dialog.getByLabel("Quantidade", { exact: true }).fill("2.5");
    await dialog.getByLabel("Custo / unidade (R$)").fill("20");
    await dialog.getByLabel("Horas totais de trabalho").fill("3");
    await dialog.getByLabel("Valor da sua hora (R$)").fill("30");
    await dialog.getByLabel("Outros custos totais (R$)").fill("10");
    await dialog.getByLabel("Margem desejada sobre a venda (%)").fill("25");
    await expect(dialog.locator(".gw-budget-preview")).toContainText("200,00");
    await dialog.getByRole("button", { name: "Usar sugestão" }).click();
    await dialog.getByLabel("Total já recebido (R$)").fill("50");
    await page.screenshot({ path: `${screenshots}/commission-editor-desktop.png` });
    await dialog.getByRole("button", { name: "Salvar encomenda", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".gw-order")).toContainText("150,00");
    let orders = await (await page.request.get(`${origin}/api/commissions`)).json();
    const order = orders.items[0];
    assert.equal(order.estimate.suggestedPrice, "200.00");
    await page.reload();
    await expect(page.locator(".gw-order h3")).toHaveText(["Armadura do explorador"]);
    for (const data of [
      { ...order, title: "Miniatura do guardião", category: "print3d", customer: "Cliente da miniatura", status: "quote", totalPrice: "180", paidAmount: "0", materials: [{ name: "Resina", quantity: 1, unitCost: "30" }], laborHours: "2", hourlyRate: "20", extraCosts: "10" },
      { ...order, title: "Acessório de festival", category: "craft", customer: "Cliente do acessório", status: "ready", totalPrice: "120", paidAmount: "120", materials: [{ name: "Tecido", quantity: 1, unitCost: "20" }], laborHours: "2", hourlyRate: "25", extraCosts: "10" },
    ]) assert.equal((await page.request.post(`${origin}/api/commissions`, { data })).status(), 201);
    await page.reload();
    await expect(page.locator(".gw-order")).toHaveCount(3);
    await page.getByRole("button", { name: "Filtrar etapa Em produção", exact: true }).click();
    await expect(page.locator(".gw-order")).toHaveCount(1);
    await page.getByRole("button", { name: "Filtrar etapa Em produção", exact: true }).click();
    await expect(page.locator(".gw-order")).toHaveCount(3);
    await page.getByRole("button", { name: "Visualização em tabela", exact: true }).click();
    await expect(page.locator(".cw-table tbody tr")).toHaveCount(3);
    await page.getByLabel("Buscar encomendas", { exact: true }).fill("guardião");
    await expect(page.locator(".cw-table tbody tr")).toHaveCount(1);
    await page.getByLabel("Buscar encomendas", { exact: true }).fill("");
    await expect(page.locator(".cw-table tbody tr")).toHaveCount(3);
    await page.getByRole("button", { name: "Visualização em projetos", exact: true }).click();
    await expect(page.locator(".gw-order")).toHaveCount(3);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${screenshots}/commissions-desktop.png`, fullPage: true });
    const mainProject = page.locator(".gw-order").filter({ hasText: "Armadura do explorador" });
    await mainProject.getByRole("button", { name: "Gerenciar", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Etapa atual").selectOption("delivered");
    await dialog.getByLabel("Total já recebido (R$)").fill("200");
    await dialog.getByRole("button", { name: "Salvar encomenda", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(mainProject.locator(".gw-badge")).toHaveText("Entregue");
    orders = await (await page.request.get(`${origin}/api/commissions`)).json();
    assert.equal(Number(orders.summary.receivable), 0);

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await login(other, accounts[1].email);
    assert.equal((await (await other.request.get(`${origin}/api/collections`)).json()).total, 0);
    assert.equal((await other.request.put(`${origin}/api/collections/${item.id}`, { data: { ...item, version: 3 } })).status(), 404);
    assert.equal((await other.request.delete(`${origin}/api/commissions/${order.id}?version=2`)).status(), 404);
    await otherContext.close();
    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    await login(member, accounts[2].email);
    await member.goto(`${origin}/collections`);
    await expect(member.getByRole("button", { name: "Adicionar à coleção", exact: true })).toHaveCount(0);
    assert.equal((await member.request.post(`${origin}/api/collections`, { data: item })).status(), 403);
    await memberContext.close();
    const anonContext = await browser.newContext();
    assert.equal((await anonContext.request.get(`${origin}/api/collections`)).status(), 401);
    await anonContext.close();

    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["collections", "commissions"]) {
      await page.goto(`${origin}/${route}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${route}: overflow mobile`);
      await page.screenshot({ path: `${screenshots}/${route}-mobile.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Nova encomenda", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Material", exact: true }).click();
    assert.equal(await page.getByRole("dialog").evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, "Dialog overflow mobile");
    await page.screenshot({ path: `${screenshots}/commission-editor-mobile.png` });
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.goto(`${origin}/platform`);
    await expect(page.getByRole("link", { name: "Abrir coleções" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir encomendas" })).toBeVisible();

    await db.update(subscriptions).set({ status: "trialing", trialEndsAt: new Date(Date.now() - 86400000) }).where(eq(subscriptions.organizationId, orgIds[0]));
    assert.equal((await page.request.get(`${origin}/api/collections`)).status(), 200);
    assert.equal((await page.request.post(`${origin}/api/commissions`, { data: order })).status(), 402);
    await db.update(subscriptions).set({ status: "canceled", periodEndsAt: null }).where(eq(subscriptions.organizationId, orgIds[0]));
    assert.equal((await page.request.get(`${origin}/api/collections`)).status(), 402);
    assert.deepEqual(errors, []);
    const result = { collections: "CRUD, empréstimo, devolução, filtros e persistência", commissions: "orçamento, pagamento parcial, entrega e persistência", security: "organização, membro, anônimo, assinatura vencida e bloqueada", desktopAndMobile: true, pageErrors: errors };
    writeFileSync(`${screenshots}/results.json`, JSON.stringify(result, null, 2));
    console.log(result);
  } catch (error) {
    await page.screenshot({ path: `${screenshots}/failure.png`, fullPage: true }).catch(() => {});
    writeFileSync(`${screenshots}/failure.html`, await page.content());
    console.log({ url: page.url(), dialogs: await page.locator("dialog").count(), visibleDialogs: await page.getByRole("dialog").count() });
    throw error;
  } finally { await browser.close(); }
}
main().finally(async () => {
  if (orgIds.length) await db.delete(organizations).where(inArray(organizations.id, orgIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await (globalThis as typeof globalThis & { sql?: { end: (options: { timeout: number }) => Promise<void> } }).sql?.end({ timeout: 5 });
}).catch((error) => { console.error(error); process.exitCode = 1; });
