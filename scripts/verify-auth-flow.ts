import { readFileSync } from "node:fs";

const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const localEnv = readFileSync(".env", "utf8");
function rawEnvValue(name: string) {
  const prefix = `${name}=`;
  const line = localEnv.split(/\r?\n/).find((entry) => entry.startsWith(prefix));
  if (!line) return undefined;
  const raw = line.slice(prefix.length);
  return ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) ? raw.slice(1, -1) : raw;
}
const email = rawEnvValue("SEED_ADMIN_EMAIL");
const password = rawEnvValue("SEED_ADMIN_PASSWORD");

if (!email || !password) {
  throw new Error("SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD são necessários para o teste de autenticação.");
}
const adminEmail: string = email;
const adminPassword: string = password;

class CookieJar {
  private values = new Map<string, string>();

  capture(response: Response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.values.set(name, cookieValue);
      else this.values.delete(name);
    }
  }

  header() {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function request(path: string, init: RequestInit = {}, jar?: CookieJar) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...init.headers, ...(jar?.header() ? { cookie: jar.header() } : {}) },
  });
  jar?.capture(response);
  return response;
}

async function csrf(jar: CookieJar) {
  const response = await request("/api/auth/csrf", {}, jar);
  if (!response.ok) throw new Error(`Falha ao obter CSRF (${response.status}).`);
  return (await response.json() as { csrfToken: string }).csrfToken;
}

async function signIn(jar: CookieJar, loginEmail: string, loginPassword: string) {
  const csrfToken = await csrf(jar);
  return request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: loginEmail, password: loginPassword, callbackUrl: baseUrl, json: "true" }),
  }, jar);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function redirectsToLogin(response: Response) {
  if (response.status >= 300 && response.status < 400) {
    return new URL(response.headers.get("location")!, baseUrl).pathname === "/login";
  }
  const body = await response.text();
  return body.includes('id="__next-page-redirect"') && body.includes("url=/login");
}

async function main() {
const anonymousPublic = await request("/");
check(anonymousPublic.ok, "A landing page pública não abriu com sucesso.");

const anonymousPrivate = await request("/dashboard");
check(await redirectsToLogin(anonymousPrivate), "O visitante anônimo tentando acessar /dashboard não foi enviado ao login.");

const invalidJar = new CookieJar();
const invalid = await signIn(invalidJar, `invalid-${Date.now()}@example.invalid`, "credencial-incorreta");
const invalidResult = await invalid.json() as { url?: string };
check(invalidResult.url?.includes("error=CredentialsSignin"), `Credenciais incorretas não foram rejeitadas (${JSON.stringify(invalidResult)}).`);

const jar = new CookieJar();
const valid = await signIn(jar, adminEmail, adminPassword);
const validResult = await valid.json() as { url?: string };
check(validResult.url === baseUrl || validResult.url === `${baseUrl}/`, "Login válido não retornou sucesso.");

const sessionResponse = await request("/api/auth/session", {}, jar);
const session = await sessionResponse.json() as { user?: { email?: string; organizationId?: string; role?: string } };
check(session.user?.email?.toLowerCase() === adminEmail.toLowerCase(), "A sessão não persistiu o usuário autenticado.");
check(Boolean(session.user.organizationId), "A sessão não contém a organização.");
check(session.user.role === "owner" || session.user.role === "admin", "O administrador não recebeu papel autorizado.");

const dashboard = await request("/dashboard", {}, jar);
check(dashboard.ok, "O dashboard não abriu com a sessão persistida.");

const policyResponse = await request("/api/pricing-policy", {}, jar);
check(policyResponse.ok, "A política de preços não pôde ser consultada.");
const originalPolicy = await policyResponse.json() as Record<string, unknown>;
const policyPayload = { name: "Política de validação", feePercent: 11, additionalCostPercent: 2, minimumMarginPercent: 16, desiredMarginPercent: 24, marketDiscountPercent: 3 };
let createdId: string | undefined;
try {
  const policyUpdate = await request("/api/pricing-policy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(policyPayload) }, jar);
  check(policyUpdate.ok, "A política de preços não foi atualizada.");

  const sku = `TEST-${Date.now()}`;
  const create = await request("/api/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Produto de validação", category: "Teste", sku, setName: "Fase 3", collectorNumber: "001", language: "pt-BR", condition: "new", finish: "standard", cost: 40, price: 50, quantity: 3, desiredMarginPercent: 24 }) }, jar);
  check(create.status === 201, `O cadastro de produto falhou (${create.status}).`);
  const created = await create.json() as { id: string }; createdId = created.id;

  const update = await request(`/api/inventory/${createdId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cost: 42, price: 55, quantity: 4, desiredMarginPercent: 26 }) }, jar);
  check(update.ok, "A edição do estoque falhou.");

  const inventory = await request(`/api/inventory?q=${encodeURIComponent(sku)}&availability=all&page=1&pageSize=10`, {}, jar);
  const inventoryBody = await inventory.json() as { items: Array<{ id: string; cost: number; currentPrice: number; stock: number }> };
  check(inventoryBody.items[0]?.id === createdId && inventoryBody.items[0].cost === 42 && inventoryBody.items[0].currentPrice === 55 && inventoryBody.items[0].stock === 4, "Os dados editados não foram persistidos.");

  const recommendationResponse = await request("/api/recommendations", {}, jar);
  check(recommendationResponse.ok, "As recomendações não puderam ser calculadas.");
  const recommendationRows = await recommendationResponse.json() as Array<{ inventoryItemId: string; minimumPrice: number; suggestedPrice: number; marketPrice: number | null }>;
  const recommendation = recommendationRows.find((row) => row.inventoryItemId === createdId);
  check(recommendation && recommendation.suggestedPrice >= recommendation.minimumPrice && recommendation.marketPrice === null, "A recomendação não preservou o mínimo ou o cenário sem mercado.");
} finally {
  if (createdId) {
    const remove = await request(`/api/inventory/${createdId}`, { method: "DELETE" }, jar);
    check(remove.status === 204, "A exclusão autorizada do produto de teste falhou.");
  }
  if (originalPolicy && originalPolicy.name) {
    const restore = await request("/api/pricing-policy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(originalPolicy) }, jar);
    check(restore.ok, "A política original não pôde ser restaurada após o teste.");
  }
}

const logoutCsrf = await csrf(jar);
const logout = await request("/api/auth/signout", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ csrfToken: logoutCsrf, callbackUrl: `${baseUrl}/login`, json: "true" }),
}, jar);
check(logout.ok, "O logout falhou.");

const afterLogout = await request("/", {}, jar);
check(await redirectsToLogin(afterLogout), "O dashboard permaneceu acessível após logout.");

console.log("Fluxo validado: autenticação, produto, estoque, política, recomendação, exclusão e logout.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
