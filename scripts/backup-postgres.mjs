import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const connection = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const target = new URL(connection);
if (target.port === "6543") throw new Error("Backup requires a direct or session connection");
const toolDirectory = process.env.POSTGRES_BIN_DIR || ".tools/pgsql/bin";
const executable = (name) => path.join(toolDirectory, name + (process.platform === "win32" ? ".exe" : ""));
const env = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || "5432",
  PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGSSLMODE: "verify-full",
  PGCONNECT_TIMEOUT: "10",
  ...(process.env.DATABASE_SSL_CA_PATH ? { PGSSLROOTCERT: path.resolve(process.env.DATABASE_SSL_CA_PATH) } : {}),
};
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("backups", { recursive: true });
const file = path.resolve("backups", `supabase-${stamp}.dump`);
function run(name, args) {
  const result = spawnSync(executable(name), args, { env, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error({ tool: name, status: result.status, code: result.error?.code });
    if (result.stderr) console.error(result.stderr.replaceAll(env.PGPASSWORD, "[REDACTED]"));
    process.exit(1);
  }
  return result.stdout;
}
const toolVersion = run("pg_dump", ["--version"]).trim();
run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", file]);
const size = fs.statSync(file).size;
if (size === 0) throw new Error("Empty backup");
const catalog = run("pg_restore", ["--list", file]);
if (!catalog.includes("Dumped from database version")) throw new Error("Invalid dump catalog");
// Decode the entire archive as SQL, so compressed blocks are actually read.
run("pg_restore", ["--file", process.platform === "win32" ? "NUL" : "/dev/null", file]);
const sha256 = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
fs.writeFileSync(file + ".sha256", `${sha256}  ${path.basename(file)}\n`);
const result = {
  createdAt: new Date().toISOString(), file, bytes: size, sha256, toolVersion,
  host: target.hostname, database: env.PGDATABASE,
  scope: "Full logical database; owner and ACL excluded. Does not back up Supabase storage objects or infrastructure.",
  catalogVerified: true, archiveDecoded: true, restorationVerified: false,
};
fs.writeFileSync(file + ".json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
