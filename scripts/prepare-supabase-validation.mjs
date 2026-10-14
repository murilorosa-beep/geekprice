import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const original = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL);
if (!original.hostname.endsWith(".supabase.com") || original.pathname !== "/postgres") {
  throw new Error("This setup requires the explicitly configured Supabase postgres database");
}
const existingTest = fs.existsSync(".env.phase81") ? fs.readFileSync(".env.phase81", "utf8") : null;
const metadataFile = fs.readdirSync("backups").filter((f) => f.endsWith(".dump.json")).sort().at(-1);
if (!metadataFile) throw new Error("A current verified backup is required");
const backup = JSON.parse(fs.readFileSync(path.join("backups", metadataFile), "utf8"));
if (backup.host !== original.hostname || backup.database !== "postgres" || !backup.archiveDecoded ||
    Date.now() - Date.parse(backup.createdAt) > 3600_000 ||
    createHash("sha256").update(fs.readFileSync(backup.file)).digest("hex") !== backup.sha256) {
  throw new Error("Backup does not match this target, is stale, or failed verification");
}
const name = existingTest?.match(/^PHASE81_TEST_DATABASE=(.*)$/m)?.[1] || "geekprice_phase81_test_" + Date.now();
if (!/^geekprice_phase81_test_\d+$/.test(name)) throw new Error("Invalid isolated test database name");
const ssl = { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true };
const admin = postgres(original.href, { ssl, prepare: false, max: 1, connect_timeout: 10 });
try {
  if (!existingTest) await admin.unsafe(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}
const testUrl = new URL(original.href);
testUrl.pathname = "/" + name;
// Persist the new target immediately so failures cannot orphan an unidentified DB.
fs.writeFileSync(".env.phase81", [
  `DATABASE_URL=${testUrl.href}`, `DATABASE_MIGRATION_URL=${testUrl.href}`,
  `PHASE81_TEST_DATABASE=${name}`, "NEXTAUTH_URL=http://localhost:3108", "",
].join("\n"));
console.log({ testDatabase: name, createdOn: original.hostname, backup: path.basename(backup.file) });
const check = postgres(testUrl.href, { ssl, prepare: false, max: 1, connect_timeout: 10 });
try {
  const [row] = await check`select current_database() as name`;
  if (row.name !== name) throw new Error("Pooler did not connect to the isolated database");
  const [tables] = await check`select count(*)::int as count from pg_tables where schemaname in ('public', 'drizzle')`;
  if (tables.count !== 0) throw new Error("Test database is not empty; no restore attempted");
  await check`create schema if not exists drizzle`;
} finally {
  await check.end();
}
const result = spawnSync(path.resolve(".tools/pgsql/bin/pg_restore.exe"), [
  "--dbname", name, "--exit-on-error", "--no-owner", "--no-acl", "--schema=public", "--schema=drizzle", backup.file,
], {
  windowsHide: true, encoding: "utf8", env: {
    ...process.env, PGHOST: testUrl.hostname, PGPORT: testUrl.port || "5432",
    PGDATABASE: name, PGUSER: decodeURIComponent(testUrl.username),
    PGPASSWORD: decodeURIComponent(testUrl.password), PGSSLMODE: "verify-full",
    PGSSLROOTCERT: path.resolve(process.env.DATABASE_SSL_CA_PATH), PGCONNECT_TIMEOUT: "10",
  },
});
if (result.error || result.status !== 0) {
  console.error({ restorationFailed: true, status: result.status, code: result.error?.code });
  if (result.stderr) console.error(result.stderr.replaceAll(decodeURIComponent(testUrl.password), "[REDACTED]"));
  process.exit(1);
}
backup.applicationRestoration = { verified: true, database: name, schemas: ["public", "drizzle"], at: new Date().toISOString() };
fs.writeFileSync(path.join("backups", metadataFile), JSON.stringify(backup, null, 2));
console.log({ applicationRestoration: "passed", testDatabase: name });
