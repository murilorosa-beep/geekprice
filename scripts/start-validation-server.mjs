import fs from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

const env = { ...process.env, ...parseEnv(fs.readFileSync(".env", "utf8")), ...parseEnv(fs.readFileSync(".env.phase81", "utf8")) };
const target = new URL(env.DATABASE_URL);
if (!/^geekprice_phase81_test_\d+$/.test(env.PHASE81_TEST_DATABASE) || target.pathname !== "/" + env.PHASE81_TEST_DATABASE) {
  throw new Error("Validation server requires the isolated test database");
}
if (process.argv.includes("--trusted-proxy")) {
  env.TRUSTED_PROXY_HOPS = "1";
  env.NEXTAUTH_URL = "http://127.0.0.1:3130";
}
const mode = process.argv.includes("--production") ? "start" : "dev";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "--hostname", "127.0.0.1", "--port", "3108"], {
  env, stdio: "inherit", windowsHide: true,
});
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
