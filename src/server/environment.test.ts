import { describe, expect, it } from "vitest";
import { assertSafeTestDatabase, getAppEnvironment, isSyntheticDataAllowed } from "./environment";

describe("Ambiente de Staging e Segurança de Base de Dados", () => {
  it("detecta ambientes corretamente", () => {
    const originalEnv = process.env.APP_ENV;
    process.env.APP_ENV = "staging";
    expect(getAppEnvironment()).toBe("staging");
    process.env.APP_ENV = "production";
    expect(getAppEnvironment()).toBe("production");
    if (originalEnv) process.env.APP_ENV = originalEnv;
    else delete process.env.APP_ENV;
  });

  it("impede operações destrutivas de teste no banco postgres comercial", () => {
    const originalEnv = process.env.APP_ENV;
    process.env.APP_ENV = "staging";
    expect(() =>
      assertSafeTestDatabase("postgresql://user:pass@host:5432/postgres?sslmode=verify-full")
    ).toThrow("banco comercial de produção");

    expect(() =>
      assertSafeTestDatabase("postgresql://user:pass@host:5432/geekprice_staging?sslmode=verify-full")
    ).not.toThrow();

    if (originalEnv) process.env.APP_ENV = originalEnv;
    else delete process.env.APP_ENV;
  });

  it("rejeita dados sintéticos em produção ou no banco comercial", () => {
    const originalEnv = process.env.APP_ENV;
    const originalDb = process.env.DATABASE_URL;

    process.env.APP_ENV = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/geekprice_staging";
    expect(isSyntheticDataAllowed()).toBe(false);

    process.env.APP_ENV = "staging";
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/postgres";
    expect(isSyntheticDataAllowed()).toBe(false);

    process.env.APP_ENV = "staging";
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/geekprice_staging";
    expect(isSyntheticDataAllowed()).toBe(true);

    if (originalEnv) process.env.APP_ENV = originalEnv;
    else delete process.env.APP_ENV;
    if (originalDb) process.env.DATABASE_URL = originalDb;
    else delete process.env.DATABASE_URL;
  });
});
