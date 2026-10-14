import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire, Module } from "node:module";
import postgres from "postgres";
import { normalizeHistoricalSnapshot } from "./snapshot-normalization.mjs";

// Replay the actual SQL on an explicitly isolated Supabase database, then use
// the installed Drizzle serializer to capture each historical schema state.
// The internal serializer is loaded in memory; node_modules is not modified.
const require = createRequire(import.meta.url);
const apiPath = require.resolve("drizzle-kit/api");
const version = JSON.parse(fs.readFileSync(path.join(path.dirname(apiPath), "package.json"), "utf8")).version;
if (version !== "0.31.11") throw new Error("Review snapshot adapter before using another Drizzle Kit version");
const serializerModule = new Module(apiPath);
serializerModule.filename = apiPath;
serializerModule.paths = Module._nodeModulePaths(path.dirname(apiPath));
serializerModule._compile(fs.readFileSync(apiPath, "utf8") + `
module.exports.phase81Snapshot = async function(query, id, prevId) {
  const value = await fromDatabase({ query }, () => true, ['public']);
  const { internal, ...snapshot } = value;
  return pgSchema.parse({ ...snapshot, id, prevId });
};`, apiPath);
const target = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL);
if (target.pathname !== "/postgres" || !target.hostname.endsWith(".supabase.com")) throw new Error("Explicit main Supabase connection required");
const backups = fs.readdirSync("backups").filter(f => f.endsWith(".dump.json")).map(f => JSON.parse(fs.readFileSync(path.join("backups", f), "utf8")))
  .filter(b => b.database === "postgres" && b.host === target.hostname).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const backup = backups.at(-1);
if (!backup?.archiveDecoded || Date.now() - Date.parse(backup.createdAt) > 3600_000 ||
    createHash("sha256").update(fs.readFileSync(backup.file)).digest("hex") !== backup.sha256) throw new Error("A current verified backup is required");
const ssl = { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true };
const admin = postgres(target.href, { ssl, prepare: false, max: 1 });
const name = "geekprice_phase81_history_" + Date.now();
await admin.unsafe(`CREATE DATABASE "${name}"`);
await admin.end();
fs.writeFileSync(".tools/phase81-history-state.json", JSON.stringify({ database: name, at: new Date().toISOString() }));
target.pathname = "/" + name;
const client = postgres(target.href, { ssl, prepare: false, max: 2, onnotice: () => {} });
const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
let previous = JSON.parse(fs.readFileSync("drizzle/meta/0006_snapshot.json", "utf8")).id;
const baseline = JSON.parse(fs.readFileSync("drizzle/meta/0006_snapshot.json", "utf8"));
const evidence = [];
let legacy;
fs.mkdirSync(".tools/historical-snapshots", { recursive: true });
try {
  const [actual] = await client`select current_database() as name`;
  if (actual.name !== name) throw new Error("History replay did not select isolated database");
  const opclasses = new Set((await client`select opcname from pg_opclass where opcdefault`).map(r => r.opcname));
  for (const entry of journal.entries) {
    const filename = `drizzle/${entry.tag}.sql`;
    const contents = fs.readFileSync(filename, "utf8");
    await client.begin(async tx => {
      for (const statement of contents.split("--> statement-breakpoint").filter(s => s.trim())) await tx.unsafe(statement);
    });
    if (entry.idx === 6) {
      legacy = await client.begin(async tx => {
        const [a, b] = await tx`insert into organizations(name,slug) values ('TESTE_SINTETICO Legacy A', 'synthetic-legacy-a'), ('TESTE_SINTETICO Legacy B', 'synthetic-legacy-b') returning id`;
        const [user] = await tx`insert into users(name,email,password_hash) values ('TESTE_SINTETICO Legacy', 'synthetic-legacy@phase81.invalid', 'SYNTHETIC_NOT_A_LOGIN_CREDENTIAL') returning id`;
        const [product] = await tx`insert into products(name,category) values('TESTE_SINTETICO Legacy Item','TESTE_SINTETICO') returning id`;
        const [variant] = await tx`insert into product_variants(product_id,sku,catalog_source,canonical_id) values(${product.id}::uuid,'SYNTHETIC-LEGACY-SKU','synthetic','SYNTHETIC-CANONICAL') returning id`;
        const [itemA, itemB] = await tx`insert into inventory_items(organization_id,variant_id,organization_sku,cost,price,quantity) values (${a.id}::uuid,${variant.id}::uuid,'SYNTHETIC-LEGACY-SKU',60,110,3),(${b.id}::uuid,${variant.id}::uuid,'SYNTHETIC-LEGACY-SKU',70,120,9) returning id`;
        const [batch] = await tx`insert into price_change_batches(organization_id,created_by_id,source,channel,status,total_items,total_value_before,total_value_after) values(${a.id}::uuid,${user.id}::uuid,'single_approve','counter','applied',1,110,120) returning id`;
        const [log] = await tx`insert into price_change_logs(organization_id,batch_id,inventory_item_id,previous_price,new_price,suggested_price,minimum_price,margin_percent,safety_status) values(${a.id}::uuid,${batch.id}::uuid,${itemA.id}::uuid,110,120,120,92.31,35,'safe_auto') returning id`;
        return { a: a.id, b: b.id, user: user.id, variant: variant.id, itemA: itemA.id, itemB: itemB.id, log: log.id };
      });
    }
    if (entry.idx < 7) continue;
    const snapshot = await serializerModule.exports.phase81Snapshot((query, params) => client.unsafe(query, params || []), randomUUID(), previous);
    previous = snapshot.id;
    const output = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
    fs.writeFileSync(path.join(".tools/historical-snapshots", output), JSON.stringify(snapshot, null, 2) + "\n");
    evidence.push({ tag: entry.tag, sqlHash: createHash("sha256").update(contents).digest("hex"), snapshot: output, tables: Object.keys(snapshot.tables).length });
    console.log({ checkpoint: entry.tag, tables: Object.keys(snapshot.tables).length });
  }
  const [preserved] = await client`select (select quantity from inventory_items where id=${legacy.itemA}::uuid) as stock_a, (select quantity from inventory_items where id=${legacy.itemB}::uuid) as stock_b, (select canonical_id from product_variants where id=${legacy.variant}::uuid) as canonical_id, (select count(*)::int from price_change_history where id=${legacy.log}::uuid) as history_rows, (select email_verified_at is not null from users where id=${legacy.user}::uuid) as email_backfilled, (select onboarding_completed_at is not null from organizations where id=${legacy.a}::uuid) as onboarding_backfilled`;
  if (preserved.stock_a !== 3 || preserved.stock_b !== 9 || preserved.canonical_id !== "SYNTHETIC-CANONICAL" || preserved.history_rows !== 1 || !preserved.email_backfilled || !preserved.onboarding_backfilled) throw new Error("Legacy data compatibility failed");
  fs.writeFileSync(".tools/phase81-snapshot-results.json", JSON.stringify({ at: new Date().toISOString(), database: name, engine: `drizzle-kit ${version}`, evidence, legacyCompatibility: preserved }, null, 2));
  // Publish only after the complete replay and all serialization steps succeed.
  for (const e of evidence) {
    const raw = JSON.parse(fs.readFileSync(path.join(".tools/historical-snapshots", e.snapshot), "utf8"));
    const normalized = normalizeHistoricalSnapshot(raw, baseline, opclasses);
    fs.writeFileSync(path.join("drizzle/meta", e.snapshot), JSON.stringify(normalized, null, 2) + "\n");
  }
  console.log({ historicalSnapshotsReconstructed: evidence.length, database: name });
} finally { await client.end(); }
