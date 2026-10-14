import { describe, expect, it } from "vitest";
import { parseBrlMarketCsv } from "./partner-csv";

describe("parseBrlMarketCsv", () => {
  const today = new Date().toISOString().slice(0, 10);
  const validHeader =
    "produto,colecao,numero,idioma,condicao,acabamento,fonte,tipo_preco,moeda,valor,data_referencia,url";

  it("analisa com sucesso linhas válidas com moeda BRL e cabeçalhos em português", () => {
    const csv = `${validHeader}\nCharizard ex,151,199/165,pt-BR,NM,foil,LigaMagic,reference,BRL,350.00,${today},https://exemplo.com/charizard`;
    const result = parseBrlMarketCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].productName).toBe("Charizard ex");
    expect(result.valid[0].currency).toBe("BRL");
    expect(result.valid[0].price).toBe(350);
    expect(result.valid[0].sourceName).toBe("LigaMagic");
  });

  it("rejeita moeda estrangeira (não-BRL)", () => {
    const csv = `${validHeader}\nCharizard ex,151,199/165,en,NM,foil,TCGPlayer,reference,USD,70.00,${today},`;
    const result = parseBrlMarketCsv(csv);

    expect(result.valid).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes("estritamente BRL"))).toBe(true);
  });

  it("rejeita preço negativo ou zerado", () => {
    const csv = `${validHeader}\nPikachu,Base Set,58/102,pt-BR,NM,standard,Fonte BR,reference,BRL,-10.00,${today},`;
    const result = parseBrlMarketCsv(csv);

    expect(result.valid).toHaveLength(0);
    expect(result.errors.some((e) => e.field === "price")).toBe(true);
  });

  it("rejeita data de referência mais antiga que 30 dias", () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const csv = `${validHeader}\nMewtwo,151,150/165,pt-BR,NM,standard,Fonte BR,reference,BRL,50.00,${oldDate},`;
    const result = parseBrlMarketCsv(csv);

    expect(result.valid).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes("últimos 30 dias"))).toBe(true);
  });

  it("gera hash sha256 consistente do conteúdo", () => {
    const csv = `${validHeader}\nPikachu,Set,1,pt-BR,NM,standard,Fonte,reference,BRL,10.00,${today},`;
    const result1 = parseBrlMarketCsv(csv);
    const result2 = parseBrlMarketCsv(csv);

    expect(result1.hash).toBe(result2.hash);
    expect(result1.hash).toHaveLength(64);
  });
});
