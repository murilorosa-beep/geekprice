import fs from "node:fs";
import http from "node:http";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import postgres from "postgres";

const fixture = JSON.parse(fs.readFileSync(".tools/phase81-fixtures.json", "utf8"));
const target = new URL(process.env.DATABASE_URL);
if (!/^geekprice_phase81_test_\d+$/.test(fixture.database) || target.pathname !== "/" + fixture.database) throw new Error("Isolated test database required");
const sql = postgres(target.href, { prepare: false, max: 1, ssl: { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true } });
const email = `synthetic-proxy-${Date.now()}@phase81.invalid`;
const [template] = await sql`select password_hash from users where email=${fixture.emailA}`;
const [user] = await sql`insert into users(name,email,password_hash,email_verified_at) values('TESTE_SINTETICO Proxy',${email},${template.password_hash},now()) returning id`;
await sql`insert into memberships(organization_id,user_id,role) values(${fixture.orgA}::uuid,${user.id}::uuid,'owner')`;

// Real HTTP proxy: only loopback can reach the backend. Incoming forwarding
// headers are replaced using the TCP peer, never sanitized and accepted.
const proxy = http.createServer((request, response) => {
  const headers = { ...request.headers, host: "127.0.0.1:3108",
    "x-forwarded-for": request.socket.remoteAddress,
    "x-forwarded-host": "127.0.0.1:3130", "x-forwarded-proto": "http" };
  delete headers["x-real-ip"];
  const upstream = http.request({ hostname: "127.0.0.1", port: 3108, path: request.url, method: request.method, headers }, received => {
    response.writeHead(received.statusCode, received.headers); received.pipe(response);
  });
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.pipe(upstream);
});
await new Promise(resolve => proxy.listen(3130, "127.0.0.1", resolve));
const cookies = new Map();
async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
  const response = await fetch("http://127.0.0.1:3130" + path, { ...init, headers, redirect: "manual" });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0], pos = pair.indexOf("="); cookies.set(pair.slice(0, pos), pair.slice(pos + 1));
  }
  return response;
}
async function login(password, spoofedIp) {
  const csrf = await (await request("/api/auth/csrf")).json();
  const result = await request("/api/auth/callback/credentials", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": spoofedIp },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, json: "true", callbackUrl: "http://127.0.0.1:3130/dashboard" }),
  });
  return { ...(await result.json()), httpStatus: result.status };
}
try {
  const valid = await login(fixture.password, "203.0.113.100");
  assert.equal(valid.httpStatus, 200);
  assert.equal(new URL(valid.url).searchParams.get("error"), null);
  const session = await (await request("/api/auth/session")).json(); assert.equal(session.user.id, user.id);
  for (let i = 0; i < 5; i++) {
    const failure = await login("wrong-password", `203.0.113.${i + 1}, 198.51.100.99`);
    assert.equal(failure.httpStatus, 401);
    assert.equal(new URL(failure.url).searchParams.get("error"), "CredentialsSignin");
  }
  const blocked = await login(fixture.password, "198.51.100.250");
  assert.equal(new URL(blocked.url).searchParams.get("error"), "LOGIN_RATE_LIMITED");
  const attempts = await sql`select origin_hash, failed_attempts from login_attempts where email=${email}`;
  assert.equal(attempts.length, 1); assert.equal(attempts[0].failed_attempts, 5);
  assert.equal(attempts[0].origin_hash, createHash("sha256").update("127.0.0.1").digest("hex"));
  await sql`update login_attempts set locked_until=now()-interval '1 second',last_attempt_at=now()-interval '31 minutes' where email=${email}`;
  const recovered = await login(fixture.password, "198.51.100.200");
  assert.equal(recovered.httpStatus, 200);
  assert.equal(new URL(recovered.url).searchParams.get("error"), null);
  assert.equal((await sql`select id from login_attempts where email=${email}`).length, 0);
  const result = { at: new Date().toISOString(), database: fixture.database, realHttpProxy: true,
    backendLoopbackOnly: true, clientHeadersOverwrittenByPeer: true, validLogin: true,
    rotatedHeadersDidNotBypassLimit: true, persistedOriginMatchesTcpPeer: true, recovery: true };
  fs.writeFileSync(".tools/phase81-proxy-results.json", JSON.stringify(result, null, 2)); console.log(result);
} finally {
  await new Promise(resolve => proxy.close(resolve)); await sql.end();
}
