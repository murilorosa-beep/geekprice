import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";
import { databaseTlsOptions } from "./src/db/connection-settings";

loadEnvConfig(process.cwd());
const migrationUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!migrationUrl) throw new Error("Configure DATABASE_MIGRATION_URL ou DATABASE_URL.");
const migrationTarget = new URL(migrationUrl);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: process.env.DATABASE_SSL_CA_PATH ? {
    host: migrationTarget.hostname,
    port: Number(migrationTarget.port || 5432),
    database: decodeURIComponent(migrationTarget.pathname.slice(1)),
    user: decodeURIComponent(migrationTarget.username),
    password: decodeURIComponent(migrationTarget.password),
    ...databaseTlsOptions(),
  } : {
    url: migrationUrl,
  },
  strict: true,
  verbose: true,
});
