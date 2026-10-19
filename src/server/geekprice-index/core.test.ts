import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeQuoteQuality, matchIndexCard, parseBrl, parseMypCard, parsePilotTsv, quoteFingerprint } from "./core";

const observedAt = new Date("2026-10-15T21:57:41Z");
const pilot = parsePilotTsv(readFileSync(resolve("data/geekprice-index/mypcards-pilot.tsv"), "utf8"), observedAt);

describe("GeekPrice Index", () => {
  it("preserva 50 impressões Pokémon e 20 Magic, com códigos únicos e preços reais positivos", () => {
    expect(pilot.filter((row) => row.game === "pokemon")).toHaveLength(50);
    expect(pilot.filter((row) => row.game === "magic")).toHaveLength(20);
    expect(new Set(pilot.map((row) => row.canonicalId)).size).toBe(70);
    expect(pilot.every((row) => Number(row.priceMin) > 0 && Number(row.priceMax) >= Number(row.priceMin))).toBe(true);
    expect(pilot.every((row) => row.sourceUrl.startsWith("https://mypcards.com/"))).toBe(true);
  });

  it("não funde a mesma carta de edições ou números diferentes", () => {
    const charizards = pilot.filter((row) => row.name === "Charizard");
    const base = charizards.find((row) => row.canonicalId === "pokemon_bs_004/102")!;
    const base2 = charizards.find((row) => row.canonicalId === "pokemon_b2_004/130")!;
    expect(base.priceMin).not.toBe(base2.priceMin);
    expect(matchIndexCard(base, [base2])).toBe("not_found");
    expect(matchIndexCard(base, [base])).toBe("exact");
    expect(matchIndexCard(base, [base, base])).toBe("ambiguous");
  });

  it("trata impressão sem ID exato como provável e acabamento divergente como não encontrado", () => {
    const base = pilot[0];
    expect(matchIndexCard({ ...base, canonicalId: "tcgdex-other" }, [base])).toBe("probable");
    expect(matchIndexCard({ ...base, finish: "holo" }, [{ ...base, finish: "normal" }])).toBe("not_found");
  });

  it("analisa BRL sem arredondar silenciosamente nem aceitar valores inválidos", () => {
    expect(parseBrl("R$ 1.234,56")).toBe("1234.56");
    expect(parseBrl("9.9")).toBe("9.90");
    for (const raw of ["0", "-1", "1.234", "NaN", "1e4", "R$ 5,999", ""]) expect(() => parseBrl(raw)).toThrow();
  });

  it("ignora resposta incompleta e extrai somente resumo de preço da fonte", () => {
    const raw = { card_code: "magic_m10_0146", internal_code: 21004, name_en: "Lightning Bolt", edition_en: "Magic 2010",
      min_price: "9.99", avg_price: "11.85", max_price: "14.00", available_quantity: 10,
      link: "https://mypcards.com/magic/produto/21004/raio" };
    expect(parseMypCard("magic", raw, observedAt)?.collectorNumber).toBe("0146");
    expect(parseMypCard("magic", { ...raw, max_price: "2.00" }, observedAt)).toBeNull();
    expect(parseMypCard("magic", { ...raw, link: "https://attacker.example/card" }, observedAt)).toBeNull();
  });

  it("deduplica mesmo resumo e reduz qualidade de fonte isolada", () => {
    expect(quoteFingerprint(pilot[0])).toBe(quoteFingerprint({ ...pilot[0], observedAt: new Date("2026-10-16") }));
    expect(quoteFingerprint(pilot[0])).not.toBe(quoteFingerprint({ ...pilot[0], priceMin: "1.00" }));
    const quality = describeQuoteQuality(observedAt, 20, 1, "exact", observedAt);
    expect(quality.level).not.toBe("high");
    expect(quality.score).toBeLessThanOrEqual(0.52);
  });

  it("rejeita linhas repetidas ou CSV sem colunas obrigatórias", () => {
    const header = "game\tname\tcode\tset\tid\tmin\tavg\tmax\tquantity\turl";
    const line = readFileSync(resolve("data/geekprice-index/mypcards-pilot.tsv"), "utf8").trim().split(/\r?\n/)[1];
    expect(() => parsePilotTsv(`${header}\n${line}\n${line}`, observedAt)).toThrow(/duplicada/);
    expect(() => parsePilotTsv("game\tname\n", observedAt)).toThrow(/Cabeçalho/);
  });
});
