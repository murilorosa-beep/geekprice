import { afterEach, describe, expect, it, vi } from "vitest";
import { brlMarketRowSchema } from "./partner-csv";
import { signBrlImportPreview, verifyBrlImportPreview } from "./preview-token";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("signed BRL preview", () => {
  it("binds confirmation to the organization, file hash and exact validated rows", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "synthetic-test-secret-only");
    const rows = [brlMarketRowSchema.parse({ productName: "TESTE_SINTETICO", currency: "BRL", price: 20, referenceAt: new Date() })];
    const hash = "a".repeat(64);
    const token = signBrlImportPreview("org-a", hash, rows);
    expect(verifyBrlImportPreview(token, "org-a", hash, rows)).toBe(true);
    expect(verifyBrlImportPreview(token, "org-b", hash, rows)).toBe(false);
    expect(verifyBrlImportPreview(token, "org-a", "b".repeat(64), rows)).toBe(false);
    expect(verifyBrlImportPreview(token, "org-a", hash, [{ ...rows[0], price: 1 }])).toBe(false);
    expect(verifyBrlImportPreview("invalid", "org-a", hash, rows)).toBe(false);
  });
  it("expires without requiring database writes during preview", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "synthetic-test-secret-only"); vi.useFakeTimers();
    const rows = [brlMarketRowSchema.parse({ productName: "TESTE_SINTETICO", currency: "BRL", price: 20, referenceAt: new Date() })];
    const token = signBrlImportPreview("org-a", "a".repeat(64), rows);
    vi.advanceTimersByTime(16 * 60_000);
    expect(verifyBrlImportPreview(token, "org-a", "a".repeat(64), rows)).toBe(false);
  });
});
