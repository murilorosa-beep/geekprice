// Read-only. Run: node --env-file=.env scripts/inspect-validation-environment.mjs
import fs from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import tls from "node:tls";

// pg_stat_ssl reports the pooler -> PostgreSQL hop. Inspect this client hop too.
const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  const socket = originalTlsConnect.apply(this, args);
  socket.once("secureConnect", () => console.log({
    clientTls: true, authorized: socket.authorized, protocol: socket.getProtocol(),
  }));
  return socket;
};

const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
const migrations = journal.entries.map((entry, index) => {
  if (entry.idx !== index || (index && entry.when <= journal.entries[index - 1].when)) {
    throw new Error("Invalid migration ordering");
  }
  return {
    tag: entry.tag,
    timestamp: entry.when,
    hash: createHash("sha256").update(fs.readFileSync(`drizzle/${entry.tag}.sql`)).digest("hex"),
    snapshot: fs.existsSync(`drizzle/meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`),
  };
});
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), migrations }, null, 2));
const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required; no fallback database is used");
const target = new URL(connectionString);
console.log({ host: target.hostname, port: target.port || "5432", database: target.pathname.slice(1) });
const ssl = process.env.DATABASE_SSL_CA_PATH
  ? { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true }
  : undefined;
const sql = postgres(connectionString, { ...(ssl ? { ssl } : {}), prepare: false, connect_timeout: 5, max: 1 });
try {
  await sql.begin("read only", async (tx) => {
    console.log(await tx`select current_database() as database, version() as version`);
    console.log(await tx`select ssl, version, cipher from pg_stat_ssl where pid = pg_backend_pid()`);
    console.log(await tx`select rolname, rolcreatedb, rolsuper from pg_roles where rolname = current_user`);
    console.log(await tx`select schemaname, tablename from pg_tables where schemaname in ('public', 'drizzle') order by schemaname, tablename`);
    const [table] = await tx`select to_regclass('drizzle.__drizzle_migrations') as name`;
    if (!table.name) {
      console.log({ migrationHistory: "missing", applied: null });
      return;
    }
    const applied = await tx`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at`;
    console.log(JSON.stringify({ applied, comparison: migrations.map((m) => ({
      tag: m.tag,
      recorded: applied.some((a) => Number(a.created_at) === m.timestamp && a.hash === m.hash),
    })) }, null, 2));
  });
} catch (error) {
  console.error({ databaseCheckFailed: true, code: error.code || error.name });
  process.exitCode = 1;
} finally {
  await sql.end();
}
