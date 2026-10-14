// Read-only audit of the configured primary Supabase database. Emits no credentials or row contents.
import fs from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";

const uri = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const target = new URL(uri);
if (!target.hostname.endsWith(".supabase.com") || target.pathname !== "/postgres") {
  throw new Error("Phase 8.2 security inspection requires the configured primary Supabase database");
}
if (!process.env.DATABASE_SSL_CA_PATH) throw new Error("Verified TLS CA is required");
const ssl = { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true };
const client = postgres(uri, { ssl, prepare: false, max: 1, connect_timeout: 10 });
function dumpIds(table) {
  const lines = fs.readFileSync("backups/pre-phase8-backup.sql").toString("utf16le").replace(/^\uFEFF/, "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`COPY public.${table} (`));
  if (start < 0) return [];
  const result = [];
  for (let index = start + 1; index < lines.length && lines[index] !== "\\."; index++) {
    if (lines[index]) result.push(lines[index].split("\t", 1)[0]);
  }
  return result;
}
try {
  const result = await client.begin("read only", async (tx) => {
    const [db] = await tx`select current_database() as name, current_setting('server_version') as version`;
    const migrations = await tx`select hash, created_at from drizzle.__drizzle_migrations order by created_at`;
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
    const migrationMatches = journal.entries.length === migrations.length && journal.entries.every((entry, index) =>
      Number(migrations[index].created_at) === entry.when &&
      migrations[index].hash === createHash("sha256").update(fs.readFileSync(`drizzle/${entry.tag}.sql`)).digest("hex")
    );
    const tables = await tx`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname
    `;
    const grants = await tx`
      select r.rolname as role, c.relname as table_name,
        has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as any_access
      from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
      where r.rolname in ('anon', 'authenticated') and n.nspname = 'public' and c.relkind in ('r', 'p')
    `;
    const foreignKeys = await tx`
      select count(*)::int as total, count(*) filter (where not convalidated)::int as unvalidated
      from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
    `;
    const indexes = await tx`
      select indexname from pg_indexes where schemaname = 'public' and indexname = any(array[
        'inventory_org_sku_uidx', 'product_variants_sku_idx', 'product_variants_sku_uidx',
        'alerts_org_created_idx', 'price_observations_currency_region_idx'
      ]) order by indexname
    `;
    const counts = await tx`
      select (select count(*) from organizations)::int as organizations,
        (select count(*) from users)::int as users,
        (select count(*) from inventory_items)::int as inventory_items,
        (select count(*) from price_observations)::int as price_observations
    `;
    const sourceTypes = await tx`
      select coalesce(config->>'type', 'unspecified') as type,
        coalesce(config->>'verified', 'false') as verified,
        count(*)::int as count from sources group by 1, 2 order by 1, 2
    `;
    const currentIds = {
      organizations: (await tx`select id::text as id from organizations`).map((row) => row.id),
      users: (await tx`select id::text as id from users`).map((row) => row.id),
    };
    const oldIds = { organizations: dumpIds("organizations"), users: dumpIds("users") };
    return {
      checkedAt: new Date().toISOString(), database: db.name, postgresVersion: db.version,
      poolMaxConfigured: Number(process.env.DATABASE_POOL_MAX || 3),
      migrations: { applied: migrations.length, local: journal.entries.length, hashesAndOrderMatch: migrationMatches },
      tables: { total: tables.length, rlsEnabled: tables.filter((row) => row.rls).length, withoutRls: tables.filter((row) => !row.rls).map((row) => row.name) },
      apiRoleGrants: grants.filter((row) => row.any_access).map((row) => `${row.role}:${row.table_name}`),
      foreignKeys: foreignKeys[0],
      requiredIndexes: indexes.map((row) => row.indexname),
      counts: counts[0], sourceTypes,
      oldLocalDumpComparison: Object.fromEntries(Object.keys(oldIds).map((table) => [table, {
        oldCount: oldIds[table].length, currentCount: currentIds[table].length,
        identicalIds: oldIds[table].length === currentIds[table].length && oldIds[table].every((id) => currentIds[table].includes(id)),
      }])),
    };
  });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/users?select=id&limit=1`, {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    console.log(JSON.stringify({ dataApiAnonymousStatus: response.status, dataApiErrorCode: body.code ?? null }));
    if (response.ok) process.exitCode = 1;
  }
  if (!result.migrations.hashesAndOrderMatch || result.tables.withoutRls.length || result.apiRoleGrants.length || result.foreignKeys.unvalidated) {
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
