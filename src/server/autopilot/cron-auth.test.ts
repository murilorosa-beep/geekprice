import { describe, expect, it } from "vitest";
import {
  isCronRequestAuthorized,
  isCronSecretConfigured,
  MINIMUM_CRON_SECRET_LENGTH,
} from "./cron-auth";

describe("autopilot cron authentication", () => {
  const secret = "s".repeat(MINIMUM_CRON_SECRET_LENGTH);

  it("recusa segredo ausente ou fraco", () => {
    expect(isCronSecretConfigured(undefined)).toBe(false);
    expect(isCronSecretConfigured("curto")).toBe(false);
    expect(isCronSecretConfigured(secret)).toBe(true);
  });

  it("aceita somente o bearer token exato", () => {
    expect(isCronRequestAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronRequestAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronRequestAuthorized(secret, secret)).toBe(false);
    expect(isCronRequestAuthorized(null, secret)).toBe(false);
  });
});
