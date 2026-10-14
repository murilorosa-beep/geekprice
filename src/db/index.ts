import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseTlsOptions } from "./connection-settings";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não está configurada.");
}

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
const poolMaximum = Number(process.env.DATABASE_POOL_MAX || 3);
if (!Number.isSafeInteger(poolMaximum) || poolMaximum < 1 || poolMaximum > 20) {
  throw new Error("DATABASE_POOL_MAX deve ser inteiro entre 1 e 20.");
}
// Supabase transaction pooling does not support prepared statements.
const client = globalForDb.sql ?? postgres(connectionString, { ...databaseTlsOptions(), prepare: false, max: poolMaximum, idle_timeout: 20, connect_timeout: 10 });
// API and SSR bundles must share one pool in production too.
globalForDb.sql = client;

export const db = drizzle(client, { schema });
