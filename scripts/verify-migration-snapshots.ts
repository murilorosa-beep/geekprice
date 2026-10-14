import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../src/db/schema";

async function main() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  let previous = "00000000-0000-0000-0000-000000000000";
  const snapshots = journal.entries.map((entry: { idx: number }) => {
    const snapshot = JSON.parse(readFileSync(`drizzle/meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`, "utf8"));
    assert.equal(snapshot.version, "7"); assert.equal(snapshot.dialect, "postgresql");
    assert.equal(snapshot.prevId, previous); previous = snapshot.id;
    return snapshot;
  });
  const current = generateDrizzleJson(schema, previous);
  writeFileSync(".tools/phase81-current-schema.json", JSON.stringify(current, null, 2));
  const drift = await generateMigration(snapshots.at(-1), current);
  const result = { at: new Date().toISOString(), snapshots: snapshots.length, chainValid: true, schemaDrift: drift };
  writeFileSync(".tools/phase81-snapshot-drift.json", JSON.stringify(result, null, 2));
  console.log({ ...result, schemaDrift: drift.slice(0, 15), driftStatements: drift.length });
  if (drift.length) process.exitCode = 1;
}
void main();
