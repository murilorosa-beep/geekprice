import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptCredentials, encryptCredentials } from "./credentials";

describe("Criptografia de Credenciais de Integração (AES-256-GCM)", () => {
  const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(() => {
    if (originalKey) process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
    else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  });
  it("criptografa e descriptografa credenciais com integridade autenticada", () => {
    const creds = {
      storeUrl: "https://minhaloja.com.br",
      consumerKey: "ck_live_1234567890abcdef",
      consumerSecret: "cs_live_0987654321fedcba",
    };

    const encrypted = encryptCredentials(creds);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("ck_live");
    expect(encrypted).not.toContain("minhaloja");

    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(creds);
  });

  it("rejeita payload adulterado ou com tag de autenticação corrompida", () => {
    const creds = { test: "secret_value" };
    const encrypted = encryptCredentials(creds);
    const parts = encrypted.split(".");

    // Adulterar os bytes criptografados
    parts[3] = Buffer.from("tampered_data").toString("base64");
    const tampered = parts.join(".");

    expect(() => decryptCredentials(tampered)).toThrow();
  });
});
