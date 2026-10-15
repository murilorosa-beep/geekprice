import { spawn } from "node:child_process";
import fs from "node:fs";
import { parseEnv } from "node:util";

const logPath = ".tools/phase93-e2e.log";
const statusPath = ".tools/phase93-e2e-status.json";
const env = {
  ...process.env,
  ...parseEnv(fs.readFileSync(".env", "utf8")),
  ...parseEnv(fs.readFileSync(".env.phase81", "utf8")),
};
fs.mkdirSync(".tools", { recursive: true });
const output = fs.createWriteStream(logPath, { flags: "w" });
const startedAt = new Date().toISOString();
const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/verify-phase93-browser.mjs"], {
  env, windowsHide: true,
});
child.stdout.pipe(output);
child.stderr.pipe(output);
const timeout = setTimeout(() => child.kill(), 12 * 60_000);
child.on("close", (code, signal) => {
  clearTimeout(timeout);
  const result = { startedAt, finishedAt: new Date().toISOString(), exitCode: code, signal: signal ?? null, logPath };
  fs.writeFileSync(statusPath, JSON.stringify(result, null, 2));
  output.end(() => process.exitCode = code ?? 1);
});
