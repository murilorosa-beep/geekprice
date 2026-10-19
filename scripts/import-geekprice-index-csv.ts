import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { assertIsolatedIndexDatabase } from "./index-isolated-db";
import { parseIndexImportCsv, type IndexImportMetadata } from "../src/server/geekprice-index/import-csv";
import { importIndexCsv } from "../src/server/geekprice-index/import-service";

async function main() {
  const target = assertIsolatedIndexDatabase();
  const args = process.argv.slice(2);
  const get = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const file = get("--file"), metaFile = get("--metadata");
  if (!file || !metaFile) throw new Error("Use --file base.csv --metadata procedencia.json [--commit].");
  const parsed = parseIndexImportCsv(readFileSync(resolve(file), "utf8"),
    JSON.parse(readFileSync(resolve(metaFile), "utf8")) as IndexImportMetadata);
  const report = { target, hash: parsed.hash, totalRows: parsed.totalRows, validRows: parsed.validRows,
    pricedRows: parsed.pricedRows, unpricedRows: parsed.unpricedRows, errors: parsed.errors.slice(0, 20) };
  if (!args.includes("--commit")) { console.log(JSON.stringify({ ...report, mode: "preview" })); return; }
  if (parsed.errors.length) throw new Error(JSON.stringify(report));
  console.log(JSON.stringify({ ...report, result: await importIndexCsv(parsed, basename(file)) }));
}
main().catch((cause) => { console.error(cause); process.exitCode = 1; });
