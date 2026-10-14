import { afterEach, describe, expect, it, vi } from "vitest";
import { getLoginOrigin, getLoginOriginHash } from "./rate-limit";

describe("rate-limit origin extraction and sanitization", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("extrai e sanitiza IP do cabeçalho x-forwarded-for simples", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const origin = getLoginOrigin({ "x-forwarded-for": "203.0.113.195" });
    expect(origin).toBe("203.0.113.195");
  });

  it("remove caracteres maliciosos ou forjados do IP", () => {
    const origin = getLoginOrigin({ "x-forwarded-for": "203.0.113.195; drop table users; --" });
    expect(origin).toBe("local-or-unknown");
  });

  it("retorna fallback seguro quando o cabeçalho está ausente ou vazio", () => {
    expect(getLoginOrigin(undefined)).toBe("local-or-unknown");
    expect(getLoginOrigin({})).toBe("local-or-unknown");
    expect(getLoginOrigin({ "x-forwarded-for": "" })).toBe("local-or-unknown");
  });

  it("ignora cabe?alhos sem proxy explicitamente confi?vel", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(getLoginOrigin({ "x-forwarded-for": "203.0.113.195" })).toBe("local-or-unknown");
  });

  it("seleciona a cadeia confi?vel e rejeita cadeias curtas", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(getLoginOrigin({ "x-forwarded-for": "1.2.3.4, 203.0.113.195, 10.0.0.1" })).toBe("203.0.113.195");
    expect(getLoginOrigin({ "x-forwarded-for": "1.2.3.4" })).toBe("local-or-unknown");
  });

  it("gera hash determinístico para a mesma origem", () => {
    const hash1 = getLoginOriginHash("192.168.1.1");
    const hash2 = getLoginOriginHash("192.168.1.1");
    const hash3 = getLoginOriginHash("192.168.1.2");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64);
  });
});
