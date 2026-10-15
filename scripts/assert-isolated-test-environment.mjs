const testDatabasePattern = /^geekprice_phase81_test_\d+$/;

function describeTarget(raw) {
  const url = new URL(raw);
  return { host: url.hostname, port: url.port || "5432", database: url.pathname.slice(1), user: decodeURIComponent(url.username) };
}

const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL || databaseUrl;
const expectedDatabase = process.env.PHASE81_TEST_DATABASE;

if (!databaseUrl || !migrationUrl || !expectedDatabase) {
  throw new Error("Testes de integração requerem DATABASE_URL, DATABASE_MIGRATION_URL e PHASE81_TEST_DATABASE.");
}

const database = describeTarget(databaseUrl);
const migration = describeTarget(migrationUrl);

if (!testDatabasePattern.test(expectedDatabase) || database.database !== expectedDatabase || migration.database !== expectedDatabase) {
  throw new Error("Destino inseguro: testes destrutivos exigem banco isolado geekprice_phase81_test_<timestamp> em ambas as URLs.");
}
if (database.database === "postgres" || migration.database === "postgres") {
  throw new Error("Destino inseguro: o banco comercial postgres nunca pode receber testes de integração.");
}
if (database.host !== migration.host || database.port !== migration.port || database.user !== migration.user) {
  throw new Error("Destino inseguro: DATABASE_URL e DATABASE_MIGRATION_URL não apontam para o mesmo destino isolado.");
}
if (process.env.APP_ENV === "production") {
  throw new Error("Destino inseguro: APP_ENV=production bloqueia testes destrutivos.");
}

console.log(JSON.stringify({
  isolatedTestEnvironment: true,
  host: database.host,
  port: database.port,
  database: database.database,
  user: database.user,
  appEnvironment: process.env.APP_ENV || process.env.NODE_ENV || "development",
}, null, 2));
