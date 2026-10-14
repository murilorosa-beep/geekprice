import { readFileSync } from "node:fs";

export function databaseTlsOptions() {
  const certificatePath = process.env.DATABASE_SSL_CA_PATH;
  if (!certificatePath) return {};
  return { ssl: { ca: readFileSync(certificatePath, "utf8"), rejectUnauthorized: true } };
}
