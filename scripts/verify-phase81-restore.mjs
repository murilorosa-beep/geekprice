import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const original = new URL(process.env.DATABASE_URL);
const mainMode = process.argv.includes("--main");
const testName = mainMode ? "postgres" : process.env.PHASE81_TEST_DATABASE;
if (!original.hostname.endsWith(".supabase.com") || original.pathname !== "/" + testName ||
    (!mainMode && !/^geekprice_phase81_test_\d+$/.test(testName))) throw new Error("Explicit Supabase source required");
const backupResult = spawnSync(process.execPath, ["scripts/backup-postgres.mjs"], {
  env: process.env, windowsHide: true, encoding: "utf8",
});
if (backupResult.status !== 0) throw new Error("Test backup failed: " + backupResult.stderr);
const backup = JSON.parse(backupResult.stdout);
assert.equal(backup.database, testName);
const ssl = { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true };
const source = postgres(original.href, { ssl, prepare: false, max: 1 });
const restoreName = "geekprice_phase81_restore_" + Date.now();
await source.unsafe(`CREATE DATABASE "${restoreName}"`);
fs.writeFileSync(".tools/phase81-restore-target.json", JSON.stringify({ database: restoreName, source: testName }));
const restoreUrl = new URL(original.href); restoreUrl.pathname = "/" + restoreName;
const target = postgres(restoreUrl.href, { ssl, prepare: false, max: 1 });
// pg_restore --schema filters objects but does not create their schemas.
await target`create schema if not exists drizzle`;
const restored = spawnSync(path.resolve(".tools/pgsql/bin/pg_restore.exe"), [
  "--dbname", restoreName, "--exit-on-error", "--no-owner", "--no-acl", "--schema=public", "--schema=drizzle", backup.file,
], { encoding: "utf8", windowsHide: true, env: {
  ...process.env, PGHOST: original.hostname, PGPORT: original.port, PGDATABASE: restoreName,
  PGUSER: decodeURIComponent(original.username), PGPASSWORD: decodeURIComponent(original.password),
  PGSSLMODE: "verify-full", PGSSLROOTCERT: path.resolve(process.env.DATABASE_SSL_CA_PATH), PGCONNECT_TIMEOUT: "10",
} });
if (restored.status !== 0) {
  await source.end();
  throw new Error("Restore failed: " + restored.stderr.replaceAll(decodeURIComponent(original.password), "[REDACTED]"));
}
const comparisons = [];
try {
  const tables = await source`select schemaname, tablename from pg_tables where schemaname in ('public','drizzle') order by schemaname,tablename`;
  for (const { schemaname, tablename } of tables) {
    if (!/^[a-z_]+$/.test(schemaname) || !/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected identifier");
    const query = `select count(*)::int as count, md5(coalesce(string_agg(row_to_json(t)::text, '' order by row_to_json(t)::text), '')) as digest from "${schemaname}"."${tablename}" t`;
    const [before] = await source.unsafe(query), [after] = await target.unsafe(query);
    assert.deepEqual(after, before);
    comparisons.push({ table: `${schemaname}.${tablename}`, rows: before.count, matched: true });
  }
  const result = { at: new Date().toISOString(), source: testName, restoredDatabase: restoreName, backup: path.basename(backup.file), comparisons };
  fs.writeFileSync(mainMode ? ".tools/supabase-main-restore-results.json" : ".tools/phase81-restore-results.json", JSON.stringify(result, null, 2));
  const metadata = JSON.parse(fs.readFileSync(backup.file + ".json", "utf8"));
  metadata.restorationVerified = true;
  metadata.applicationRestoration = { database: restoreName, tablesCompared: comparisons.length, rowsCompared: comparisons.reduce((sum, t) => sum + t.rows, 0), at: result.at };
  fs.writeFileSync(backup.file + ".json", JSON.stringify(metadata, null, 2));
  console.log({ restoredDatabase: restoreName, tablesVerified: comparisons.length, rowsVerified: comparisons.reduce((sum, t) => sum + t.rows, 0), backup: path.basename(backup.file) });
} finally {
  await source.end(); await target.end();
}
