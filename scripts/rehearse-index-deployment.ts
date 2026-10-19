import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";

async function main() {
  const target = assertIsolatedIndexDatabase();
  assert.equal(target.database, "geekprice_index_dev");
  const url = new URL(process.env.DATABASE_URL!);
  const scratchName = `geekprice_phase81_test_${Date.now()}`;
  assert.match(scratchName, /^geekprice_phase81_test_\d+$/);
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port, PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: "disable" };
  const backup = resolve(".tools/index-integration-backup.dump");
  function run(tool: string, args: string[]) {
    const result = spawnSync(resolve(`.tools/index-postgres/pgsql/bin/${tool}.exe`), args, { env, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`${tool}: ${result.stderr}`);
  }
  run("pg_dump", ["-d", target.database, "-Fc", "-f", backup]);
  run("pg_restore", ["--list", backup]);
  run("createdb", [scratchName]);
  run("pg_restore", ["--exit-on-error", "--no-owner", "-d", scratchName, backup]);
  url.pathname = `/${scratchName}`;
  process.env.DATABASE_URL = url.toString();
  assertIsolatedIndexDatabase();
  const client = postgres(url.toString(), { ssl: false, max: 1 });
  try {
    assert.equal((await client`select current_database() as name`)[0].name, scratchName);
    const fingerprint = async () => (await client`select md5(coalesce((select string_agg(row_to_json(i)::text, '' order by id) from inventory_items i), '')) as stock,
      (select count(*)::int from organizations) as organizations, (select count(*)::int from products) as products`)[0];
    const before = await fingerprint();
    const restored = (await client`select count(*)::int as count from index_cards`)[0].count;
    assert.equal(restored, 70);
    // Only this newly created clone is reset to its pre-0015 state.
    await client`drop table index_inventory_links, index_imports, index_runs, index_observations, index_cards, index_sources`;
    await client`delete from drizzle.__drizzle_migrations where created_at >= 1792101750444`;
    const connection = drizzle(client);
    await migrate(connection, { migrationsFolder: resolve("drizzle") });
    await migrate(connection, { migrationsFolder: resolve("drizzle") });
    const { parsePilotTsv } = await import("../src/server/geekprice-index/core");
    const { storeIndexQuote } = await import("../src/server/geekprice-index/service");
    const manifest = JSON.parse(readFileSync(resolve("data/geekprice-index/manifest.json"), "utf8"));
    const quotes = parsePilotTsv(readFileSync(resolve("data/geekprice-index/mypcards-pilot.tsv"), "utf8"), new Date(manifest.observed_at));
    for (let pass = 0; pass < 2; pass++) for (const quote of quotes) await storeIndexQuote(quote);
    const [counts] = await client`select (select count(*)::int from index_cards) as cards, (select count(*)::int from index_observations) as observations,
      (select count(*)::int from drizzle.__drizzle_migrations) as migrations`;
    assert.deepEqual(counts, { cards: 70, observations: 70, migrations: 17 });
    assert.deepEqual(await fingerprint(), before);
    const result = { source: target, scratchDatabase: scratchName, backup, restorePassed: true, replay0015And0016: true,
      migrationRerunNoop: true, seedRuns: 2, ...counts, privateInventoryUnchanged: true };
    writeFileSync(resolve(".tools/index-deployment-rehearsal.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await client.end(); }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
