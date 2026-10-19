import { afterEach, expect, it, vi } from "vitest";
import { databaseTlsOptions } from "./connection-settings";
afterEach(() => vi.unstubAllEnvs());
it("local development ignores inherited commercial CA", () => {
  vi.stubEnv("DATABASE_URL", "postgres://geekprice@127.0.0.1:55432/geekprice_index_dev");
  vi.stubEnv("DATABASE_SSL_CA_PATH", "does-not-exist.crt");
  vi.stubEnv("APP_ENV", "test");
  expect(databaseTlsOptions()).toEqual({ ssl: false });
});
it("remote connections validate TLS and reject insecure overrides", () => {
  vi.stubEnv("DATABASE_URL", "postgres://example.test/db");
  vi.stubEnv("DATABASE_SSL_CA_PATH", "");
  vi.stubEnv("DATABASE_SSL_REJECT_UNAUTHORIZED", "true");
  expect(databaseTlsOptions()).toEqual({ ssl: { rejectUnauthorized: true } });
  vi.stubEnv("DATABASE_SSL_REJECT_UNAUTHORIZED", "false");
  expect(() => databaseTlsOptions()).toThrow(/TLS/);
});
