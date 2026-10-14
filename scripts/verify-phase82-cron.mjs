import assert from "node:assert/strict";
import fs from "node:fs";
import postgres from "postgres";

const fixture = JSON.parse(fs.readFileSync(".tools/phase81-fixtures.json", "utf8"));
const target = new URL(process.env.DATABASE_URL);
if (!/^geekprice_phase81_test_\d+$/.test(fixture.database) || target.pathname !== `/${fixture.database}`) {
  throw new Error("The cron validation requires the isolated Supabase database");
}
const secret = process.env.CRON_SECRET;
if (!secret || secret.length < 32) throw new Error("A synthetic cron secret is required");
const sql = postgres(target.href, {
  ssl: { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true },
  prepare: false, max: 1, connect_timeout: 10,
});
const origin = "http://127.0.0.1:3108";
const post = (authorization) => fetch(origin + "/api/autopilot/cron", {
  method: "POST", headers: authorization ? { authorization } : {}, signal: AbortSignal.timeout(120_000),
});
const countBatches = async () => Number((await sql`select count(*)::int as count from price_change_batches where source='autopilot_auto'`)[0].count);
try {
  assert.equal((await fetch(origin + "/api/autopilot/cron")).status, 405);
  assert.equal((await post()).status, 401);
  assert.equal((await post("Bearer wrong-synthetic-secret")).status, 401);

  const reserved = await sql.reserve();
  try {
    const [lock] = await reserved`select pg_try_advisory_lock(hashtextextended('geekprice:autopilot-worker', 0)) as acquired`;
    assert.equal(lock.acquired, true);
    assert.equal((await post(`Bearer ${secret}`)).status, 409);
  } finally {
    await reserved`select pg_advisory_unlock(hashtextextended('geekprice:autopilot-worker', 0))`;
    reserved.release();
  }

  const before = await countBatches();
  const first = await post(`Bearer ${secret}`);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.success, true);
  const afterFirst = await countBatches();
  const second = await post(`Bearer ${secret}`);
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.success, true);
  const afterSecond = await countBatches();
  assert.equal(afterSecond, afterFirst);
  const result = {
    at: new Date().toISOString(), database: fixture.database, methodRestricted: true,
    unauthorizedRejected: true, wrongSecretRejected: true, concurrentCycleRejected: true,
    authorizedRuns: 2, organizationsProcessed: firstBody.organizationsProcessed,
    firstAppliedCount: firstBody.appliedCount, secondAppliedCount: secondBody.appliedCount,
    autoBatchesBefore: before, autoBatchesAfterFirst: afterFirst, autoBatchesAfterSecond: afterSecond,
    secondRunIdempotent: true,
  };
  fs.writeFileSync(".tools/phase82-cron-results.json", JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  await sql.end();
}
