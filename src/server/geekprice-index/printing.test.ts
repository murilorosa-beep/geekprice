import { expect, it } from "vitest";
import { matchStockPrinting } from "./core";
it.each([
  ["pokemon", "Coleção Básica", "Base Set"],
  ["pokemon", "Evolutions", "XY 12: Evolutions"],
  ["magic", "Revised Edition", "Revised"],
] as const)("matches explicit %s set alias %s", (game, setName, target) => {
  expect(matchStockPrinting({ game, name: "Card", setName, collectorNumber: "4" },
    { game, name: "Card", setName: target, collectorNumber: "004/102" })).toBe("exact");
});
it("never treats fuzzy names or conflicting denominators as identity", () => {
  const card = { game: "pokemon", name: "Charizard", setName: "Base Set", collectorNumber: "004/102" };
  expect(matchStockPrinting({ ...card, game: "pokemon", name: "Charizard EX" }, card)).not.toBe("exact");
  expect(matchStockPrinting({ ...card, game: "pokemon", setName: "Base Set 2", collectorNumber: "004/130" }, card)).toBe("not_found");
});
