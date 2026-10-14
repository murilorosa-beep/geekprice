import fs from "node:fs";
import assert from "node:assert/strict";
import { parseEnv } from "node:util";
import { chromium } from "playwright";

const env = parseEnv(fs.readFileSync(".env", "utf8"));
assert.equal(new URL(env.DATABASE_URL).pathname, "/postgres");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(45_000);
try {
  await page.goto("http://127.0.0.1:3000/login");
  await page.getByLabel("E-mail", { exact: true }).fill(env.SEED_ADMIN_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(env.SEED_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/dashboard");
  const session = await (await page.request.get("http://127.0.0.1:3000/api/auth/session")).json();
  assert.equal(session.user.email, env.SEED_ADMIN_EMAIL.toLowerCase());
  await page.getByRole("heading", { name: "Histórico e Posicionamento de Preços" }).waitFor();
  const inventory = await (await page.request.get("http://127.0.0.1:3000/api/inventory")).json();
  const history = await (await page.request.get("http://127.0.0.1:3000/api/market/history?days=30")).json();
  assert.equal(inventory.total, 0);
  assert.equal(history.hasData, false);
  await page.screenshot({ path: ".tools/supabase-main-dashboard.png", fullPage: true });
  const result = { at: new Date().toISOString(), database: "postgres", login: "passed", dashboard: "passed", inventoryItems: inventory.total, historyEmpty: true, commercialPricesChanged: false };
  fs.writeFileSync(".tools/supabase-main-browser-results.json", JSON.stringify(result, null, 2));
  console.log(result);
} finally { await browser.close(); }
