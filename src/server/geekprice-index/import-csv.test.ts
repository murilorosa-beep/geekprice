import { describe, expect, it } from "vitest";
import { INDEX_CSV_HEADER, parseIndexImportCsv, type IndexImportMetadata } from "./import-csv";
import { matchStockPrinting } from "./core";

const metadata: IndexImportMetadata = { sourceCode: "licensed_archive_2026", sourceName: "Arquivo autorizado",
  sourceBaseUrl: "https://prices.example", acquisitionMethod: "authorized_csv",
  rightsReference: "Contrato autorizado GP-2026-001", sourceSnapshotAt: "2026-10-15T22:00:00.000Z" };
const priced = "pokemon,Charizard,pokemon_bs_004/102,Base Set,BS,004/102,,pt-BR,foil,NM,1500.00,5180.43,25000.00,2026-10-15T21:00:00.000Z,https://prices.example/cards/1,1";
const unpriced = "pokemon,Blastoise,pokemon_bs_002/102,Base Set,BS,002/102,,,,,,,,,,";

describe("importação do Index", () => {
  it("preserva preço real, data e uma impressão sem preço no denominador", () => {
    const result = parseIndexImportCsv(`${INDEX_CSV_HEADER}\n${priced}\n${unpriced}\n`, metadata);
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(2);
    expect(result.pricedRows).toBe(1);
    expect(result.unpricedRows).toBe(1);
    expect(result.rows[0].quote?.providerAverage).toBe("5180.43");
    expect(result.rows[1].quote).toBeNull();
  });
  it("rejeita cotação de outro domínio, data futura, preços inválidos e impressão repetida", () => {
    expect(parseIndexImportCsv(`${INDEX_CSV_HEADER}\n${priced.replace("prices.example", "other.example")}\n`, metadata).errors).toHaveLength(1);
    expect(parseIndexImportCsv(`${INDEX_CSV_HEADER}\n${priced.replace("2026-10-15T21:00:00.000Z", "2026-10-20T21:00:00.000Z")}\n`, metadata).errors).toHaveLength(1);
    expect(parseIndexImportCsv(`${INDEX_CSV_HEADER}\n${priced.replace("1500.00", "0.00")}\n`, metadata).errors).toHaveLength(1);
    expect(parseIndexImportCsv(`${INDEX_CSV_HEADER}\n${priced}\n${priced}\n`, metadata).errors).toHaveLength(1);
  });
  it("distingue impressão exata de provável entre TCGdex e MYP", () => {
    const index = { game: "pokemon", name: "Charizard", setName: "Base Set", collectorNumber: "004/102" };
    expect(matchStockPrinting({ game: "pokemon", name: "Charizard", setName: "Base Set", collectorNumber: "4" }, index)).toBe("exact");
    expect(matchStockPrinting({ game: "pokemon", name: "Charizard", setName: "Base Set 2", collectorNumber: "004/102" }, index)).toBe("probable");
    expect(matchStockPrinting({ game: "pokemon", name: "Charizard", setName: "Base Set", collectorNumber: "004/130" }, index)).toBe("not_found");
  });
});
