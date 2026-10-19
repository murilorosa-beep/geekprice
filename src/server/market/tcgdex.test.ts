import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectorHttpError, fetchWithRetry, tcgdexConnector } from "./tcgdex";
afterEach(() => vi.unstubAllGlobals());

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

it("supplements missing localized printings without inventing their language", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/pt-br/") ?
    [{ id: "sv1-1", name: "Carta PT", localId: "1" }] :
    [{ id: "base1-4", name: "Charizard", localId: "4" }, { id: "sv1-1", name: "Card EN", localId: "1" }]))));
  const cards = await tcgdexConnector.search({ name: "Charizard", language: "pt-br" });
  expect(cards).toHaveLength(2);
  expect(cards.find((card) => card.id === "base1-4")?.language).toBe("en");
  expect(cards.find((card) => card.id === "sv1-1")?.language).toBe("pt-br");
});
