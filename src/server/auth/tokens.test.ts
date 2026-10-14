import { describe, expect, it } from "vitest";
import { buildAuthActionToken, hashActionToken } from "./tokens";

describe("auth action tokens", () => {
  it("stores only the hash and creates an expiration", () => {
    const before = Date.now();
    const created = buildAuthActionToken("verify_email", 60_000);

    expect(created.token).toHaveLength(43);
    expect(created.record.tokenHash).toBe(hashActionToken(created.token));
    expect(created.record.tokenHash).not.toBe(created.token);
    expect(created.record.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("creates unique tokens", () => {
    expect(buildAuthActionToken("reset_password", 60_000).token)
      .not.toBe(buildAuthActionToken("reset_password", 60_000).token);
  });
});
