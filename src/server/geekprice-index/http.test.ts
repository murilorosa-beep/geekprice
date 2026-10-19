import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOrganization, assertPublicActionAllowed } = vi.hoisted(() => ({
  requireOrganization: vi.fn(), assertPublicActionAllowed: vi.fn(),
}));
vi.mock("@/server/auth/context", () => ({
  requireOrganization,
  authErrorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status || 500 }),
}));
vi.mock("@/server/auth/public-rate-limit", () => ({
  assertPublicActionAllowed,
  PublicActionRateLimitError: class extends Error {},
}));

import { indexRead } from "./http";

describe("Index API authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); requireOrganization.mockResolvedValue({ organizationId: "org-a" }); });

  it("blocks an unauthenticated request before touching data", async () => {
    requireOrganization.mockRejectedValueOnce({ status: 401, message: "Autenticação necessária." });
    const work = vi.fn();
    const response = await indexRead(new Request("https://example.test/api/geekprice-index/v1/coverage"), work);
    expect(response.status).toBe(401);
    expect(work).not.toHaveBeenCalled();
    expect(assertPublicActionAllowed).not.toHaveBeenCalled();
  });

  it("scopes rate limiting to the authenticated organization and returns private cache headers", async () => {
    const request = new Request("https://example.test/api/geekprice-index/v1/coverage");
    const response = await indexRead(request, async () => ({ cards: 70 }));
    expect(assertPublicActionAllowed).toHaveBeenCalledWith(request, "index-read:org-a", 120, 60_000);
    expect(response.headers.get("cache-control")).toBe("private, max-age=30");
    expect(await response.json()).toEqual({ data: { cards: 70 }, version: "v1" });
  });
});
