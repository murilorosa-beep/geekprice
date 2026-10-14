import { describe, expect, it } from "vitest";
import { parseInventoryCsv } from "./csv";

const header = "produto,categoria,sku,colecao,numero,custo,preco,quantidade,margem";
describe("parseInventoryCsv", () => {
  it("normaliza cabeçalhos em português", () => {
    const result = parseInventoryCsv(`${header}\nPikachu ex,Pokemon,PK-01,151,25/165,10.50,20.00,2,25`);
    expect(result.errors).toHaveLength(0); expect(result.valid[0]).toMatchObject({ name: "Pikachu ex", sku: "PK-01", cost: "10.50", quantity: 2 });
  });
  it("detecta SKU duplicado", () => {
    const line = "Pikachu ex,Pokemon,PK-01,151,25/165,10.50,20.00,2,25";
    expect(parseInventoryCsv(`${header}\n${line}\n${line}`).errors.some((error) => error.message.includes("duplicado"))).toBe(true);
  });
  it("reporta linhas inválidas", () => {
    expect(parseInventoryCsv(`${header}\nX,Pokemon,PK-01,151,25/165,-1,20.00,2,25`).errors.length).toBeGreaterThan(0);
  });
});
