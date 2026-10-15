import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseTlsOptions } from "./connection-settings";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  db?: DbInstance;
};

function getDb(): DbInstance {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const poolMaximum = Number(process.env.DATABASE_POOL_MAX || 3);
  if (!Number.isSafeInteger(poolMaximum) || poolMaximum < 1 || poolMaximum > 20) {
    throw new Error("DATABASE_POOL_MAX deve ser inteiro entre 1 e 20.");
  }

  // Supabase transaction pooling does not support prepared statements.
  const client =
    globalForDb.sql ??
    postgres(connectionString, {
      ...databaseTlsOptions(),
      prepare: false,
      max: poolMaximum,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  // API and SSR bundles must share one pool in production too.
  globalForDb.sql = client;

  const dbInstance = drizzle(client, { schema });
  globalForDb.db = dbInstance;
  return dbInstance;
}

export const db = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    if (prop === "__esModule" || prop === "then" || typeof prop === "symbol") {
      return undefined;
    }
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

