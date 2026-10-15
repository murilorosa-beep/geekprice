import { readFileSync } from "node:fs";

export function databaseTlsOptions() {
  const configuredPath = process.env.DATABASE_SSL_CA_PATH;
  if (configuredPath) {
    return { ssl: { ca: readFileSync(configuredPath, "utf8"), rejectUnauthorized: true } };
  }

  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    return { ssl: { rejectUnauthorized: false } };
  }

  return {};
}
