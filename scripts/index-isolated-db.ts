export function assertIsolatedIndexDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.APP_ENV === "production") throw new Error("Banco isolado obrigatório para o Index.");
  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isolatedName = dbName === "geekprice_index_dev" || /^geekprice_phase81_test_\d+$/.test(dbName);
  if (!local || !isolatedName) throw new Error("Operação bloqueada: use PostgreSQL local geekprice_index_dev ou banco de teste isolado.");
  return { host: url.hostname, database: dbName };
}
