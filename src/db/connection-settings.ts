import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function databaseTlsOptions() {
  const configuredPath = process.env.DATABASE_SSL_CA_PATH;
  if (configuredPath && existsSync(configuredPath)) {
    return { ssl: { ca: readFileSync(configuredPath, "utf8"), rejectUnauthorized: true } };
  }

  const bundledCa = resolve(process.cwd(), "certs", "supabase-prod-ca-2021.crt");
  if (existsSync(bundledCa)) {
    return { ssl: { ca: readFileSync(bundledCa, "utf8"), rejectUnauthorized: true } };
  }

  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    return { ssl: { rejectUnauthorized: false } };
  }

  return {};
}
