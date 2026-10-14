import fs from "node:fs";
import assert from "node:assert/strict";

const fixture = JSON.parse(fs.readFileSync(".tools/phase81-fixtures.json", "utf8"));
if (!/^geekprice_phase81_test_\d+$/.test(fixture.database)) throw new Error("Isolated fixtures required");
const origin = "http://127.0.0.1:3108";
const results = [];
class Session {
  cookies = new Map();
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const response = await fetch(origin + path, { ...options, headers, redirect: "manual" });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0], separator = pair.indexOf("=");
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
  async login(email) {
    const csrf = await (await this.request("/api/auth/csrf")).json();
    const response = await this.request("/api/auth/callback/credentials", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: fixture.password, json: "true", callbackUrl: origin }),
    });
    assert.equal(response.status, 200);
    const session = await (await this.request("/api/auth/session")).json();
    assert.equal(session.user.email, email);
    return session;
  }
}
const json = body => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function pass(name) { results.push({ name, passed: true }); console.log("PASS " + name); }

const owner = new Session(), other = new Session(), member = new Session();
assert.equal((await owner.login(fixture.emailA)).user.organizationId, fixture.orgA);
assert.equal((await other.login(fixture.emailB)).user.organizationId, fixture.orgB);
await member.login(fixture.emailMember); pass("HTTP login of three real synthetic users");
const name = "TESTE_SINTETICO HTTP " + Date.now();
const created = await owner.request("/api/inventory", json({ name, category: "TESTE_SINTETICO", sku: name,
  setName: "SYNTHETIC", collectorNumber: "002", language: "pt-BR", condition: "NM", finish: "standard",
  cost: 60, price: 110, quantity: 1, desiredMarginPercent: 25 }));
assert.equal(created.status, 201); const item = await created.json(); pass("HTTP inventory persists in PostgreSQL");
assert.equal((await member.request("/api/inventory", json({}))).status, 403);
assert.equal((await other.request(`/api/inventory/${item.id}`, { ...json({ price: 1 }), method: "PATCH" })).status, 404);
pass("HTTP member permissions and cross-organization protection");
const date = new Date().toISOString();
const csv = "produto,colecao,numero,idioma,condicao,acabamento,fonte,tipo_preco,moeda,valor,data_referencia,url\n" +
  `${name},SYNTHETIC,002,pt-BR,NM,standard,TESTE_SINTETICO HTTP PRIVATE,reference,BRL,120,${date},`;
const form = new FormData(); form.set("file", new File([csv], "TESTE_SINTETICO.csv", { type: "text/csv" }));
const previewResponse = await owner.request("/api/market/partner-import/preview", { method: "POST", body: form });
assert.equal(previewResponse.status, 200); const preview = await previewResponse.json();
assert.equal(preview.errors.length, 0); assert.equal(preview.valid.length, 1);
const payload = { hash: preview.hash, previewToken: preview.previewToken, rows: preview.valid };
assert.equal((await other.request("/api/market/partner-import/commit", json(payload))).status, 403);
assert.equal((await owner.request("/api/market/partner-import/commit", json({ ...payload, rows: [{ ...payload.rows[0], price: 1 }] }))).status, 403);
pass("HTTP preview signature prevents foreign or tampered confirmation");
const commit = await owner.request("/api/market/partner-import/commit", json(payload));
assert.equal(commit.status, 201); assert.equal((await commit.json()).insertedObservations, 1);
const duplicate = await owner.request("/api/market/partner-import/commit", json(payload));
assert.equal(duplicate.status, 201); assert.equal((await duplicate.json()).insertedObservations, 0);
const inventory = await (await owner.request("/api/inventory?pageSize=100")).json();
assert.equal(inventory.items.find(i => i.id === item.id).marketPrice, 120);
pass("HTTP CSV upload, preview, commit, query and duplicate prevention");
const applied = await owner.request("/api/autopilot/apply", json({ channel: "counter", itemIds: [item.id], applyAllSafe: false, notes: "TESTE_SINTETICO HTTP approval" }));
assert.equal(applied.status, 200); const approval = await applied.json();
assert.equal(approval.success, true);
assert.equal((await owner.request("/api/autopilot/apply", json({ channel: "counter", itemIds: [item.id], applyAllSafe: false }))).status, 400);
assert.equal((await other.request("/api/autopilot/rollback", json({ batchId: approval.batch.id }))).status, 404);
const rollback = await owner.request("/api/autopilot/rollback", json({ batchId: approval.batch.id }));
assert.equal(rollback.status, 200); assert.equal((await rollback.json()).success, true);
assert.equal((await owner.request("/api/autopilot/rollback", json({ batchId: approval.batch.id }))).status, 409);
pass("HTTP supervised Autopilot approval and rollback");
const history = await (await owner.request("/api/market/history?days=30")).json();
assert.equal(history.hasData, true); assert(history.summary.totalObservations >= 3);
pass("HTTP history returns PostgreSQL observations");
fs.writeFileSync(".tools/phase81-http-results.json", JSON.stringify({ at: new Date().toISOString(), database: fixture.database, results }, null, 2));
