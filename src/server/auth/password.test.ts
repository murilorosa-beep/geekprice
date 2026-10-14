import { hash as hashBcrypt } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("cria e valida hashes Argon2id sem expor a senha", async () => {
    const hash = await hashPassword("Uma senha local muito forte! 2026");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("Uma senha local");
    await expect(verifyPassword(hash, "Uma senha local muito forte! 2026")).resolves.toEqual({ valid: true, needsUpgrade: false });
  });

  it("rejeita senha incorreta", async () => {
    const hash = await hashPassword("Senha correta e longa! 2026");
    await expect(verifyPassword(hash, "senha incorreta")).resolves.toEqual({ valid: false, needsUpgrade: false });
  });

  it("aceita bcrypt legado e solicita migração", async () => {
    const hash = await hashBcrypt("Senha legada segura! 2026", 4);
    await expect(verifyPassword(hash, "Senha legada segura! 2026")).resolves.toEqual({ valid: true, needsUpgrade: true });
  });
});
