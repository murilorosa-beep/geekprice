import { readFileSync } from "node:fs";

export function databaseTlsOptions() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://localhost");
  const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (local && process.env.APP_ENV !== "production") return { ssl: false as const };
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false" || url.searchParams.get("sslmode") === "disable") {
    throw new Error("Conexões remotas exigem validação TLS de certificado e hostname.");
  }
  const configuredPath = process.env.DATABASE_SSL_CA_PATH;
  if (configuredPath) {
    return { ssl: { ca: readFileSync(configuredPath, "utf8"), rejectUnauthorized: true } };
  }

  return { ssl: { rejectUnauthorized: true } };
}
