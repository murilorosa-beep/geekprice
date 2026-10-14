import { describe, expect, it, vi } from "vitest";
import { ConnectorHttpError, fetchWithRetry } from "./tcgdex";

describe("fetchWithRetry", () => {
  it("repete após limite temporário", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const response = await fetchWithRetry("https://example.test", 2, fetcher);
    expect(response.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("não repete erro permanente", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchWithRetry("https://example.test", 3, fetcher)).rejects.toBeInstanceOf(ConnectorHttpError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
